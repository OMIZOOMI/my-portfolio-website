import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";

// Run the real application modules, with native media simulated deterministically.
const require = createRequire(import.meta.url);
const modules = new Map();
function loadTypeScript(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const localRequire = (specifier) => specifier.startsWith(".")
    ? loadTypeScript(resolve(dirname(filename), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`))
    : require(specifier);
  runInThisContext(`(function(module, exports, require) { ${output}\n})`, { filename })(loaded, loaded.exports, localRequire);
  return loaded.exports;
}
const root = fileURLToPath(new URL("../", import.meta.url));
const { createMusicPlaybackController } = loadTypeScript(resolve(root, "src/components/desktop/musicPlayback.ts"));
const { useMusicStore: store, mountMusicPlayer, MUSIC_TRACKS } = loadTypeScript(resolve(root, "src/components/desktop/useMusicStore.ts"));

class FakeAudio extends EventTarget {
  src = "";
  currentSrc = "";
  currentTime = 0;
  duration = NaN;
  paused = true;
  ended = false;
  readyState = 0;
  volume = 1;
  preload = "auto";
  error = null;
  loadCalls = 0;
  playCalls = [];
  supported = "probably";
  ownerDocument = { baseURI: "http://portfolio.test/" };
  canPlayType() { return this.supported; }
  load() {
    this.loadCalls++;
    this.currentSrc = this.src;
    this.currentTime = 0;
    this.duration = NaN;
    this.readyState = 0;
    this.error = null;
    this.paused = true;
    this.ended = false;
  }
  play() {
    this.paused = false;
    this.emit("play");
    return new Promise((resolve, reject) => this.playCalls.push({ resolve, reject }));
  }
  pause() { this.paused = true; this.emit("pause"); }
  removeAttribute(name) { if (name === "src") this.src = ""; }
  emit(name) { this.dispatchEvent(new Event(name)); }
  metadata(duration = 243.173) {
    this.duration = duration;
    this.readyState = 1;
    this.emit("loadedmetadata");
    this.readyState = 4;
    this.emit("canplay");
  }
  playing() { this.paused = false; this.emit("playing"); }
  ending() { this.currentTime = this.duration; this.ended = true; this.emit("ended"); }
}

function clock() {
  let serial = 0;
  const timers = new Map();
  return {
    setTimeout: (fn, milliseconds) => { const id = ++serial; timers.set(id, { fn, milliseconds }); return id; },
    clearTimeout: (id) => timers.delete(id),
    tick: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(({ fn }) => fn()); },
    get size() { return timers.size; },
    get serial() { return serial; },
  };
}
const tracks = Array.from({ length: 4 }, (_, index) => ({ src: `/music/track-${index}.mp3` }));
const flush = () => new Promise((resolve) => setImmediate(resolve));
function player(options = {}) {
  const audio = new FakeAudio();
  const timers = clock();
  const state = { isPlaying: false, currentTime: 0, duration: 0, durationLoaded: false, status: "idle", error: null };
  const updates = [];
  let endings = 0;
  const controller = createMusicPlaybackController({
    audio, tracks, clock: timers,
    onState(update) { Object.assign(state, update); updates.push(update); },
    onEnded() { endings++; },
    ...options,
  });
  return { audio, timers, state, updates, controller, get endings() { return endings; } };
}

describe("on-demand native Music playback", () => {
  test("mount neither requests nor plays audio and starts synchronously only on intent", () => {
    const p = player();
    assert.equal(p.audio.src, "");
    assert.equal(p.audio.preload, "none");
    assert.equal(p.audio.loadCalls, 0);
    assert.equal(p.audio.playCalls.length, 0);
    p.controller.togglePlay();
    assert.equal(p.audio.src, tracks[0].src);
    assert.equal(p.audio.loadCalls, 1);
    assert.equal(p.audio.playCalls.length, 1, "play is called in the user action, without awaiting metadata");
    assert.equal(p.state.status, "loading");
    assert.equal(p.state.isPlaying, false, "intent does not pretend the media has started");
    assert.equal(p.state.duration, 0);
    p.controller.dispose();
  });

  test("metadata owns duration, seeking works beyond two minutes and clamps safely", () => {
    const p = player();
    p.controller.loadTrack(1, false);
    p.controller.seek(143.6);
    p.audio.metadata(287.451);
    assert.equal(p.state.duration, 287.451);
    assert.equal(p.state.durationLoaded, true);
    assert.equal(p.audio.currentTime, 143.6);
    assert.equal(p.state.status, "paused");
    p.controller.seek(1000);
    assert.equal(p.audio.currentTime, 287.451);
    p.controller.seek(-20);
    assert.equal(p.audio.currentTime, 0);
    p.controller.seek(NaN);
    assert.equal(p.audio.currentTime, 0);
    assert.equal(p.audio.playCalls.length, 0, "seeking a paused track stays paused");
    p.controller.dispose();
  });

  test("a rejected old play promise cannot replace the newer selection's state", async () => {
    const p = player();
    p.controller.loadTrack(0, true);
    const oldPlay = p.audio.playCalls[0];
    p.controller.loadTrack(3, true);
    p.audio.metadata(321);
    p.audio.playing();
    p.audio.playCalls[1].resolve();
    oldPlay.reject(Object.assign(new Error("interrupted"), { name: "AbortError" }));
    await flush();
    assert.equal(p.audio.src, tracks[3].src);
    assert.equal(p.state.duration, 321);
    assert.equal(p.state.status, "playing");
    assert.equal(p.state.error, null);
    assert.equal(p.controller.wantsPlayback(), true);
    p.controller.dispose();
  });

  test("pause while Play is pending prevents late completion/events from resuming", async () => {
    const p = player();
    p.controller.togglePlay();
    p.controller.togglePlay();
    p.audio.metadata();
    p.audio.playCalls[0].resolve();
    p.audio.playing();
    await flush();
    assert.equal(p.audio.paused, true);
    assert.equal(p.state.isPlaying, false);
    assert.equal(p.controller.wantsPlayback(), false);
    assert.equal(p.timers.size, 0);
    p.controller.dispose();
  });

  test("a blocked play promise remains actionable after late metadata; Play retries", async () => {
    const p = player();
    p.controller.togglePlay();
    p.audio.playCalls[0].reject(Object.assign(new Error("gesture"), { name: "NotAllowedError" }));
    await flush();
    p.audio.metadata();
    assert.equal(p.state.status, "blocked");
    assert.match(p.state.error, /Press Play/);
    assert.equal(p.state.isPlaying, false);
    assert.equal(p.timers.size, 0);
    p.controller.togglePlay();
    p.audio.playing();
    p.audio.playCalls[1].resolve();
    await flush();
    assert.equal(p.state.status, "playing");
    assert.equal(p.state.error, null);
    p.controller.dispose();
  });

  test("loading has a finite deadline, cancels the request, and Retry restores position", () => {
    const p = player({ initialTime: 145 });
    p.controller.togglePlay();
    p.audio.metadata(300);
    assert.equal(p.audio.currentTime, 145);
    p.timers.tick();
    assert.equal(p.state.status, "error");
    assert.equal(p.audio.src, "");
    assert.equal(p.audio.paused, true);
    assert.equal(p.controller.wantsPlayback(), false);
    p.controller.retry();
    assert.equal(p.audio.src, tracks[0].src);
    p.audio.metadata(300);
    assert.equal(p.audio.currentTime, 145);
    assert.equal(p.audio.playCalls.length, 2);
    p.controller.dispose();
  });

  test("a saved resume survives timeout before metadata and a subsequent retry", () => {
    const p = player({ initialTime: 150 });
    p.controller.togglePlay();
    assert.equal(p.audio.currentTime, 0, "the native source has not received metadata yet");
    p.timers.tick();
    assert.equal(p.state.status, "error");
    assert.equal(p.state.currentTime, 150);
    p.controller.retry();
    p.audio.metadata(300);
    assert.equal(p.audio.currentTime, 150);
    assert.equal(p.state.currentTime, 150);
    p.controller.dispose();
  });

  test("pause and close before metadata preserve the unapplied resume/seek position", () => {
    const p = player({ initialTime: 150 });
    p.controller.togglePlay();
    p.controller.togglePlay();
    assert.equal(p.state.currentTime, 150);
    p.controller.seek(163);
    p.controller.dispose();
    assert.equal(p.state.currentTime, 163);
    assert.equal(p.audio.src, "");
    assert.equal(p.audio.paused, true);
  });

  test("repeated waiting events cannot extend a buffering deadline indefinitely", () => {
    const p = player();
    p.controller.togglePlay();
    p.audio.metadata();
    p.audio.playing();
    assert.equal(p.timers.size, 0);
    p.audio.emit("waiting");
    const serial = p.timers.serial;
    p.audio.emit("stalled");
    p.audio.emit("waiting");
    assert.equal(p.timers.serial, serial);
    assert.equal(p.state.status, "buffering");
    p.timers.tick();
    assert.equal(p.state.status, "error");
    assert.match(p.state.error, /taking too long/);
    p.controller.dispose();
  });

  test("a network stall with sufficient buffered media keeps playing without a timeout", () => {
    const p = player();
    p.controller.togglePlay();
    p.audio.metadata();
    p.audio.playing();
    assert.equal(p.audio.readyState, 4);
    p.audio.emit("stalled");
    assert.equal(p.state.status, "playing");
    assert.equal(p.state.isPlaying, true);
    assert.equal(p.timers.size, 0);
    p.audio.readyState = 2;
    p.audio.emit("stalled");
    assert.equal(p.state.status, "buffering");
    assert.equal(p.timers.size, 1);
    p.controller.dispose();
  });

  test("fetch/decode failures never leave playback loading and can be retried", () => {
    const p = player();
    p.controller.loadTrack(2, true);
    p.audio.error = { code: 3 };
    p.audio.emit("error");
    assert.equal(p.state.status, "error");
    assert.match(p.state.error, /decoded/);
    p.audio.metadata(250);
    assert.equal(p.state.status, "error", "late metadata must not hide the failed decoder");
    p.controller.retry();
    assert.equal(p.state.status, "loading");
    assert.equal(p.audio.src, tracks[2].src);
    p.audio.metadata(250);
    p.audio.playing();
    assert.equal(p.state.status, "playing");
    p.controller.dispose();
  });

  test("unsupported audio reports an error without claiming playback", () => {
    const p = player();
    p.audio.supported = "";
    p.controller.togglePlay();
    assert.equal(p.state.status, "error");
    assert.match(p.state.error, /does not support MP3/);
    assert.equal(p.audio.playCalls.length, 0);
    assert.equal(p.audio.src, "");
    assert.equal(p.timers.size, 0);
    p.controller.dispose();
  });

  test("ended advances only once, and a restarted track can end again", () => {
    const p = player();
    p.controller.togglePlay();
    p.audio.metadata(260);
    p.audio.playing();
    p.audio.ending();
    p.audio.ending();
    assert.equal(p.endings, 1);
    assert.equal(p.state.currentTime, 260);
    p.controller.restart(true);
    p.audio.metadata(260);
    p.audio.playing();
    p.audio.ending();
    assert.equal(p.endings, 2);
    p.controller.dispose();
  });

  test("queued events from a replaced source cannot mark its replacement as playing, ended or failed", () => {
    const p = player();
    p.controller.loadTrack(0, true);
    p.audio.metadata(260);
    p.audio.playing();
    p.controller.loadTrack(1, true);
    p.audio.emit("playing");
    p.audio.emit("ended");
    p.audio.emit("error");
    assert.equal(p.state.status, "loading");
    assert.equal(p.state.isPlaying, false);
    assert.equal(p.state.error, null);
    assert.equal(p.endings, 0);
    p.audio.metadata(300);
    p.audio.emit("ended");
    assert.equal(p.endings, 0, "an ended event without the current media ending is ignored");
    p.audio.playing();
    p.audio.ending();
    assert.equal(p.endings, 1);
    p.controller.dispose();
  });

  test("close pauses, releases src/listeners/timer, and ignores late play outcomes", async () => {
    const p = player();
    p.controller.togglePlay();
    p.audio.metadata(300);
    p.audio.currentTime = 152.2;
    p.controller.dispose();
    const updates = p.updates.length;
    assert.equal(p.audio.paused, true);
    assert.equal(p.audio.src, "");
    assert.equal(p.state.currentTime, 152.2);
    assert.equal(p.timers.size, 0);
    p.audio.playCalls[0].reject(new Error("late"));
    p.audio.emit("playing");
    p.controller.togglePlay();
    p.controller.retry();
    await flush();
    assert.equal(p.updates.length, updates);
    assert.equal(p.audio.playCalls.length, 1);
  });

  test("volume is clamped and user values survive source changes", () => {
    const p = player({ initialVolume: 0.37 });
    assert.equal(p.audio.volume, 0.37);
    p.controller.setVolume(2);
    assert.equal(p.audio.volume, 1);
    p.controller.setVolume(-1);
    assert.equal(p.audio.volume, 0);
    p.controller.setVolume(0.24);
    p.controller.loadTrack(2, false);
    assert.equal(p.audio.volume, 0.24);
    p.controller.dispose();
  });
});

describe("Music store and app lifecycle", () => {
  function reset() {
    store.getState().stop();
    store.setState(store.getInitialState(), true);
  }
  const state = () => store.getState();

  test("mood queues retain next, previous, shuffle and ending within the chosen playlist", () => {
    reset();
    const audio = new FakeAudio(), release = mountMusicPlayer(audio);
    state().playQueue([6, 7, 8], 7);
    assert.deepEqual(state().queue, [6, 7, 8]);
    audio.metadata(); audio.playing(); state().nextTrack();
    assert.equal(state().currentTrackIndex, 8);
    state().previousTrack(); assert.equal(state().currentTrackIndex, 7);
    state().toggleShuffle();
    for (let i = 0; i < 20; i++) { const prior = state().currentTrackIndex; state().nextTrack(); assert.ok([6, 7, 8].includes(state().currentTrackIndex)); assert.notEqual(state().currentTrackIndex, prior); }
    audio.metadata(); audio.playing(); audio.ending();
    assert.ok([6, 7, 8].includes(state().currentTrackIndex));
    state().playQueue([0, 3, 1, 6], 0); assert.deepEqual(state().history, []);
    assert.deepEqual(state().queue, [0, 3, 1, 6]); release();
  });

  test("invalid queues cannot replace playback and duplicate indices are removed", () => {
    reset(); const prior = state().queue;
    state().playQueue([-1, NaN, 99], 0); assert.equal(state().queue, prior);
    state().playQueue([0, 1], 2); assert.equal(state().queue, prior);
    state().playQueue([0, 0, 2, -1], 2); assert.deepEqual(state().queue, [0, 2]);
  });

  test("commands cannot invent a playing state without a mounted player", () => {
    reset();
    state().togglePlay();
    assert.equal(state().isPlaying, false);
    assert.equal(state().playbackRequested, false);
    state().selectTrack(2, true);
    assert.equal(state().currentTrackIndex, 2);
    assert.equal(state().status, "idle");
    assert.equal(state().duration, 0);
  });

  test("only one live player survives a replacement; stale cleanup leaves it intact", () => {
    reset();
    const first = new FakeAudio();
    const releaseFirst = mountMusicPlayer(first);
    state().togglePlay();
    first.metadata(240);
    first.playing();
    const second = new FakeAudio();
    const releaseSecond = mountMusicPlayer(second);
    const currentController = state().controller;
    assert.equal(first.paused, true);
    assert.equal(first.src, "");
    assert.equal(second.src, "");
    assert.equal(second.loadCalls, 0);
    assert.equal(state().isPlaying, false);
    releaseFirst();
    assert.equal(state().controller, currentController);
    releaseSecond();
    assert.equal(state().controller, null);
  });

  test("close releases immediately; reopening keeps position without autoplay or requests", () => {
    reset();
    const first = new FakeAudio();
    const releaseFirst = mountMusicPlayer(first);
    state().selectTrack(1, true);
    first.metadata(227.879);
    first.playing();
    first.currentTime = 143.25;
    first.emit("timeupdate");
    state().stop();
    assert.equal(first.src, "");
    assert.equal(first.paused, true);
    assert.equal(state().currentTrackIndex, 1);
    assert.equal(state().currentTime, 143.25);
    assert.equal(state().trackDurations[MUSIC_TRACKS[1].id], 227.879);
    const second = new FakeAudio();
    const releaseSecond = mountMusicPlayer(second);
    releaseFirst();
    assert.equal(second.src, "");
    assert.equal(second.playCalls.length, 0);
    state().togglePlay();
    second.metadata(227.879);
    assert.equal(second.currentTime, 143.25);
    assert.equal(second.playCalls.length, 1);
    releaseSecond();
  });

  test("closing a resumed player before its new metadata arrives retains the saved position", () => {
    reset();
    store.setState({ currentTrackIndex: 1, currentTime: 150 });
    const first = new FakeAudio();
    const releaseFirst = mountMusicPlayer(first);
    state().togglePlay();
    assert.equal(first.currentTime, 0);
    state().stop();
    assert.equal(state().currentTime, 150);
    const second = new FakeAudio();
    const releaseSecond = mountMusicPlayer(second);
    releaseFirst();
    state().togglePlay();
    second.metadata(227.879);
    assert.equal(second.currentTime, 150);
    releaseSecond();
  });

  test("Next preserves pause; shuffle excludes the current track and Previous follows history", () => {
    reset();
    const audio = new FakeAudio();
    const release = mountMusicPlayer(audio);
    state().nextTrack();
    assert.equal(state().currentTrackIndex, 1);
    assert.equal(state().playbackRequested, false);
    assert.equal(audio.playCalls.length, 0);
    audio.metadata();
    state().toggleShuffle();
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      state().nextTrack();
      assert.equal(state().currentTrackIndex, 2);
      state().nextTrack();
      assert.equal(state().currentTrackIndex, 3);
      state().previousTrack();
      assert.equal(state().currentTrackIndex, 2);
      state().previousTrack();
      assert.equal(state().currentTrackIndex, 1);
    } finally { Math.random = originalRandom; release(); }
  });

  test("real endings advance automatically; repeat reloads the same complete track", () => {
    reset();
    const audio = new FakeAudio();
    const release = mountMusicPlayer(audio);
    state().selectTrack(0, true);
    audio.metadata(194.64);
    audio.playing();
    audio.currentTime = 194.64;
    audio.ending();
    assert.equal(state().currentTrackIndex, 1);
    assert.equal(audio.src, MUSIC_TRACKS[1].src);
    assert.equal(audio.playCalls.length, 2);
    audio.metadata(227.88);
    audio.playing();
    state().toggleRepeat();
    audio.currentTime = 227.88;
    audio.ending();
    assert.equal(state().currentTrackIndex, 1);
    assert.equal(audio.playCalls.length, 3);
    assert.equal(state().currentTime, 0);
    audio.metadata(227.88);
    audio.playing();
    audio.ending();
    assert.equal(audio.playCalls.length, 4, "repeat remains repeatable after its first ending");
    release();
  });

  test("late old-source metadata cannot contaminate a newer track's measured duration", () => {
    reset();
    const audio = new FakeAudio();
    const release = mountMusicPlayer(audio);
    state().selectTrack(0, true);
    state().selectTrack(3, true);
    audio.currentSrc = MUSIC_TRACKS[0].src;
    audio.metadata(194.64);
    assert.equal(state().duration, 0);
    assert.deepEqual(state().trackDurations, {});
    audio.currentSrc = MUSIC_TRACKS[3].src;
    audio.metadata(184.058);
    assert.equal(state().duration, 184.058);
    assert.deepEqual(state().trackDurations, { [MUSIC_TRACKS[3].id]: 184.058 });
    release();
  });
});
