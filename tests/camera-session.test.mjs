import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Deterministic controller tests: fake browser media objects, manual clock,
// and controllable native permission promises. No real camera/OS/browser claim.
const filename = fileURLToPath(new URL("../src/components/webcam/CameraSession.ts", import.meta.url));
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

class TrackedEvents extends EventTarget {
  listeners = new Map();
  addEventListener(name, callback, options) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
    return super.addEventListener(name, callback, options);
  }
  removeEventListener(name, callback, options) {
    this.listeners.get(name)?.delete(callback);
    return super.removeEventListener(name, callback, options);
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
  emit(name) { this.dispatchEvent(new Event(name)); }
}

class FakeTrack extends TrackedEvents {
  kind = "video";
  readyState = "live";
  enabled = true;
  muted = false;
  stops = 0;
  stop() { this.stops++; this.readyState = "ended"; }
  end() { this.readyState = "ended"; this.emit("ended"); }
  mute() { this.muted = true; this.emit("mute"); }
  unmute() { this.muted = false; this.emit("unmute"); }
}

class FakeVideo extends TrackedEvents {
  srcObject = null;
  readyState = 0;
  videoWidth = 0;
  currentTime = 0;
  paused = true;
  muted = false;
  playsInline = false;
  pauses = 0;
  plays = 0;
  playBehaviors = [];
  play() {
    this.plays++;
    const outcome = this.playBehaviors.shift();
    if (outcome instanceof Error || outcome instanceof DOMException) {
      this.paused = true;
      return Promise.reject(outcome);
    }
    this.paused = false;
    if (this.readyState >= 2) this.emit("playing");
    return outcome ?? Promise.resolve();
  }
  pause() { this.pauses++; this.paused = true; }
  ready() {
    this.readyState = 2;
    this.videoWidth = 1280;
    this.currentTime += 0.1;
    this.emit("loadeddata");
    this.emit("canplay");
    if (!this.paused) this.emit("playing");
  }
}

function stream(...tracks) {
  if (!tracks.length) tracks = [new FakeTrack()];
  return { getTracks: () => tracks, getVideoTracks: () => tracks.filter(track => track.kind === "video") };
}

function clock() {
  let now = 1_000, serial = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { due: now + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    get size() { return timers.size; },
    async advance(ms) {
      const end = now + ms;
      let iterations = 0;
      while (true) {
        const next = [...timers.entries()].filter(([, entry]) => entry.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        assert.ok(++iterations < 10_000, "timer loop must remain bounded");
        const [id, { due, fn }] = next;
        timers.delete(id);
        now = due;
        fn();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}

function harness(options = {}) {
  const timers = clock();
  const requests = [];
  const calls = [];
  const request = (constraints) => {
    const pending = deferred();
    requests.push(pending);
    calls.push(constraints);
    return pending.promise;
  };
  const loadedModule = { exports: {} };
  class ClockDate extends Date { static now() { return timers.now(); } }
  runInNewContext(`(function(module, exports) { ${compiled}\n})(module, module.exports)`, {
    module: loadedModule, DOMException, Date: ClockDate,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    navigator: { mediaDevices: { getUserMedia: request } }, isSecureContext: true,
  }, { filename });
  const { CameraSession, CameraRequestBroker, cameraErrorMessage } = loadedModule.exports;
  const video = new FakeVideo();
  const broker = new CameraRequestBroker(request);
  const defaults = { broker, secure: () => true, available: () => true, requestTimeoutMs: 100, frameTimeoutMs: 200, monitorMs: 20 };
  const create = (settings = {}, node = video) => new CameraSession(() => node, { ...defaults, ...settings });
  const session = create(options);
  return { session, video, broker, timers, requests, calls, create, CameraSession, cameraErrorMessage };
}

async function attach(h, { ready = true } = {}) {
  h.session.setActive(true);
  const media = stream();
  h.requests.at(-1).resolve(media);
  await flush();
  if (ready) h.video.ready();
  await flush();
  return media;
}

test("native request asks for camera only and separates permission from arriving frames", async () => {
  const h = harness({ broker: undefined });
  assert.equal(h.session.getSnapshot().status, "off");
  h.session.setActive(true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.calls[0].audio, false);
  assert.equal(h.calls[0].video.width.ideal, 1280);
  assert.equal(h.session.getSnapshot().status, "requesting");
  assert.equal(h.session.getSnapshot().permission, "unknown");
  assert.equal(h.session.getSnapshot().liveTrack, false);
  h.requests[0].resolve(stream());
  await flush();
  assert.equal(h.session.getSnapshot().permission, "granted");
  assert.equal(h.session.getSnapshot().status, "starting");
  assert.equal(h.video.muted, true);
  assert.equal(h.video.playsInline, true);
  h.video.ready();
  assert.equal(h.session.getSnapshot().status, "live");
  h.session.setActive(false);
  assert.equal(h.timers.size, 0);
});

test("closing during a delayed permission response stops late tracks and never attaches video", async () => {
  const h = harness();
  let notifications = 0;
  h.session.subscribe(() => notifications++);
  h.session.setActive(true);
  h.session.setActive(false);
  const countAfterClose = notifications;
  const media = stream();
  h.requests[0].resolve(media);
  await flush();
  assert.equal(media.getTracks()[0].readyState, "ended");
  assert.equal(media.getTracks()[0].stops, 1);
  assert.equal(h.video.srcObject, null);
  assert.equal(h.video.plays, 0);
  assert.equal(h.session.getSnapshot().status, "paused");
  assert.equal(notifications, countAfterClose);
  assert.equal(h.timers.size, 0);
});

test("permission denial is actionable and a later retry can obtain a live camera", async () => {
  const h = harness();
  h.session.setActive(true);
  h.requests[0].reject(new DOMException("dismissed", "NotAllowedError"));
  await flush();
  assert.equal(h.session.getSnapshot().status, "error");
  assert.equal(h.session.getSnapshot().permission, "denied");
  assert.equal(h.session.getSnapshot().liveTrack, false);
  assert.match(h.session.getSnapshot().message, /denied or dismissed.*retry/);
  h.session.retry();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(stream());
  await flush();
  h.video.ready();
  assert.equal(h.session.getSnapshot().status, "live");
  assert.equal(h.session.getSnapshot().permission, "granted");
  h.session.setActive(false);
});

test("request timeout cannot spawn competing native prompts and late success remains discarded", async () => {
  const h = harness();
  h.session.setActive(true);
  await h.timers.advance(100);
  assert.equal(h.session.getSnapshot().status, "error");
  assert.match(h.session.getSnapshot().message, /still waiting/);
  h.session.retry();
  await flush();
  assert.equal(h.requests.length, 1);
  assert.match(h.session.getSnapshot().message, /still pending/);
  const late = stream();
  h.requests[0].resolve(late);
  await flush();
  assert.equal(late.getTracks()[0].readyState, "ended");
  assert.equal(h.video.srcObject, null);
  h.session.retry();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(stream());
  await flush();
  h.video.ready();
  assert.equal(h.session.getSnapshot().status, "live");
  h.session.setActive(false);
});

test("overlapping windows share a broker and never open two native requests or camera owners", async () => {
  const h = harness();
  const otherVideo = new FakeVideo();
  const other = h.create({}, otherVideo);
  h.session.setActive(true);
  other.setActive(true);
  await flush();
  assert.equal(h.requests.length, 1);
  assert.equal(other.getSnapshot().status, "error");
  assert.match(other.getSnapshot().message, /still pending/);
  const media = stream();
  h.requests[0].resolve(media);
  await flush();
  h.video.ready();
  other.retry();
  await flush();
  assert.equal(h.requests.length, 1);
  assert.match(other.getSnapshot().message, /Another camera session/);
  assert.equal(media.getTracks()[0].readyState, "live");
  h.session.setActive(false);
  other.retry();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(stream());
  await flush();
  otherVideo.ready();
  assert.equal(other.getSnapshot().status, "live");
  other.setActive(false);
});

test("minimize/hidden releases camera, video, all listeners and timers immediately; restore requests anew", async () => {
  const h = harness();
  const media = await attach(h);
  const track = media.getTracks()[0];
  assert.ok(track.listenerCount > 0);
  assert.ok(h.video.listenerCount > 0);
  assert.ok(h.timers.size > 0);
  h.session.setActive(false);
  assert.equal(track.readyState, "ended");
  assert.equal(track.stops, 1);
  assert.equal(track.listenerCount, 0);
  assert.equal(h.video.listenerCount, 0);
  assert.equal(h.video.srcObject, null);
  assert.equal(h.video.paused, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.session.getSnapshot().status, "paused");
  assert.equal(h.session.getSnapshot().liveTrack, false);
  h.session.setActive(true);
  assert.equal(h.session.getSnapshot().status, "resuming");
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(stream());
  await flush();
  h.video.ready();
  assert.equal(h.session.getSnapshot().status, "live");
  h.session.setActive(false);
});

test("turning camera off really stops tracks; toggling it while hidden does not request media", async () => {
  const h = harness();
  const media = await attach(h);
  h.session.setEnabled(false);
  assert.equal(media.getTracks()[0].readyState, "ended");
  assert.equal(h.session.getSnapshot().status, "off");
  assert.equal(h.session.getSnapshot().liveTrack, false);
  assert.equal(h.video.srcObject, null);
  h.session.setActive(false);
  h.session.setEnabled(true);
  assert.equal(h.requests.length, 1);
  h.session.setActive(true);
  assert.equal(h.requests.length, 2);
  h.session.setActive(false);
  h.requests[1].resolve(stream());
  await flush();
});

test("play rejection preserves granted permission and offers a user-activation resume without reacquiring", async () => {
  const h = harness();
  h.video.playBehaviors.push(new DOMException("activation required", "NotAllowedError"));
  await attach(h);
  assert.equal(h.session.getSnapshot().status, "playback-blocked");
  assert.equal(h.session.getSnapshot().permission, "granted");
  assert.equal(h.session.getSnapshot().liveTrack, true);
  assert.match(h.session.getSnapshot().message, /Resume camera/);
  await h.timers.advance(500);
  assert.equal(h.session.getSnapshot().status, "playback-blocked");
  h.session.resumePlayback();
  assert.equal(h.video.plays, 2, "play runs directly in the resume action");
  await flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.session.getSnapshot().status, "live");
  h.session.setActive(false);
});

test("late play completion after close cannot republish a live camera", async () => {
  const h = harness();
  const playback = deferred();
  h.video.playBehaviors.push(playback.promise);
  const media = await attach(h, { ready: false });
  h.session.setActive(false);
  h.video.ready();
  playback.resolve();
  await flush();
  assert.equal(h.session.getSnapshot().status, "paused");
  assert.equal(h.session.getSnapshot().liveTrack, false);
  assert.equal(media.getTracks()[0].readyState, "ended");
  assert.equal(h.video.srcObject, null);
  assert.equal(h.timers.size, 0);
});

test("a granted camera that never produces frames times out with retryable status and releases tracks", async () => {
  const h = harness();
  const media = await attach(h, { ready: false });
  assert.equal(h.session.getSnapshot().status, "starting");
  await h.timers.advance(200);
  assert.equal(h.session.getSnapshot().status, "error");
  assert.match(h.session.getSnapshot().message, /did not produce video frames/);
  assert.equal(h.session.getSnapshot().permission, "granted");
  assert.equal(h.session.getSnapshot().liveTrack, false);
  assert.equal(media.getTracks()[0].readyState, "ended");
  assert.equal(h.timers.size, 0);
});

test("track interruption and recovery reflect real muted/live state; disconnection is actionable", async () => {
  const h = harness();
  const media = await attach(h);
  const track = media.getTracks()[0];
  track.mute();
  assert.equal(h.session.getSnapshot().status, "starting");
  assert.equal(h.session.getSnapshot().liveTrack, false);
  track.unmute();
  assert.equal(h.session.getSnapshot().status, "live");
  assert.equal(h.session.getSnapshot().liveTrack, true);
  track.end();
  assert.equal(h.session.getSnapshot().status, "error");
  assert.match(h.session.getSnapshot().message, /disconnected or permission/);
  assert.equal(h.session.getSnapshot().liveTrack, false);
  assert.equal(track.listenerCount, 0);
  assert.equal(h.video.listenerCount, 0);
  assert.equal(h.timers.size, 0);
});

test("a delayed successful first frame retires the startup deadline before a later brief interruption", async () => {
  const h = harness();
  await attach(h, { ready: false });
  await h.timers.advance(150);
  h.video.ready();
  assert.equal(h.session.getSnapshot().status, "live");
  await h.timers.advance(20);
  h.video.srcObject.getVideoTracks()[0].mute();
  await h.timers.advance(30);
  assert.equal(h.session.getSnapshot().status, "starting", "the old first-frame deadline must not treat an established stream as never started");
  assert.equal(h.session.getSnapshot().permission, "granted");
  h.video.srcObject.getVideoTracks()[0].unmute();
  h.video.currentTime += 0.1;
  assert.equal(h.session.getSnapshot().status, "live");
  h.session.setActive(false);
});

test("external camera disable is noticed by monitoring rather than continuing to claim live", async () => {
  const h = harness();
  const media = await attach(h);
  media.getTracks()[0].enabled = false;
  await h.timers.advance(20);
  assert.equal(h.session.getSnapshot().status, "starting");
  assert.equal(h.session.getSnapshot().liveTrack, false);
  h.session.setActive(false);
});

test("stalled live video fails within the bounded frame timeout and drops the stream", async () => {
  const h = harness();
  const media = await attach(h);
  await h.timers.advance(220);
  assert.equal(h.session.getSnapshot().status, "error");
  assert.match(h.session.getSnapshot().message, /stalled/);
  assert.equal(media.getTracks()[0].readyState, "ended");
  assert.equal(h.session.getSnapshot().liveTrack, false);
  assert.equal(h.timers.size, 0);
});

test("video error releases everything and cannot receive stale listener updates", async () => {
  const h = harness();
  const media = await attach(h);
  h.video.emit("error");
  assert.equal(h.session.getSnapshot().status, "error");
  assert.match(h.session.getSnapshot().message, /could not be played/);
  h.video.emit("playing");
  assert.equal(h.session.getSnapshot().status, "error");
  assert.equal(media.getTracks()[0].readyState, "ended");
  assert.equal(h.video.listenerCount, 0);
  assert.equal(h.timers.size, 0);
});

test("insecure and unsupported environments fail before requesting permission", () => {
  for (const [options, expected] of [[{ secure: () => false }, /HTTPS or localhost/], [{ available: () => false }, /not supported/]]) {
    const h = harness(options);
    h.session.setActive(true);
    assert.equal(h.requests.length, 0);
    assert.equal(h.session.getSnapshot().status, "error");
    assert.match(h.session.getSnapshot().message, expected);
    assert.equal(h.session.getSnapshot().liveTrack, false);
    assert.equal(h.timers.size, 0);
  }
});

test("unavailable/busy/device-settings native failures have specific recoverable messages", async () => {
  for (const [name, expected] of [["NotFoundError", /No camera was found/], ["NotReadableError", /busy or unavailable/], ["OverconstrainedError", /requested settings/], ["SecurityError", /disabled for this site/], ["InvalidStateError", /page is not active/]]) {
    const h = harness();
    h.session.setActive(true);
    h.requests[0].reject(new DOMException("test native rejection", name));
    await flush();
    assert.equal(h.session.getSnapshot().status, "error");
    assert.match(h.session.getSnapshot().message, expected);
    assert.equal(h.session.getSnapshot().liveTrack, false);
    assert.equal(h.timers.size, 0);
  }
});

test("an absent preview or stream without a live video track is safely rejected", async () => {
  for (const mode of ["preview", "track"]) {
    const h = harness();
    const node = mode === "preview" ? null : h.video;
    const session = h.create({}, node);
    session.setActive(true);
    const media = stream();
    if (mode === "track") media.getTracks()[0].readyState = "ended";
    h.requests[0].resolve(media);
    await flush();
    assert.equal(session.getSnapshot().status, "error");
    assert.match(session.getSnapshot().message, mode === "preview" ? /preview is not available/ : /no live video track/);
    assert.equal(media.getTracks()[0].readyState, "ended");
    assert.equal(h.timers.size, 0);
  }
});
