import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(name, scope = {}) {
  const source = readFileSync(new URL(`../src/components/desktop/${name}.ts`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = { exports: {} };
  runInNewContext(`(function(module,exports){${output}\n})(box,box.exports)`, { box: loaded, ...scope });
  return loaded.exports;
}

test("Heat Sink keeps a local Top 10, stable ties, last score and mute across reloads", () => {
  const data = new Map([["unrelated", "unchanged"]]);
  const scope = { window: { localStorage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) } } };
  const store = load("heatSinkStorage", scope);
  let profile = store.updateHeatSinkSettings(store.readHeatSinkProfile(), { initials: "o-m99", muted: true });
  for (let i = 0; i < 15; i++) profile = store.recordHeatSinkScore(profile, i * 10, undefined, i);
  profile = store.recordHeatSinkScore(profile, 130, "A12", 32);
  profile = store.recordHeatSinkScore(profile, 0, undefined, 33);
  assert.equal(store.writeHeatSinkProfile(profile), true);
  const reloaded = load("heatSinkStorage", scope).readHeatSinkProfile();
  assert.equal(reloaded.entries.length, 10);
  assert.equal(reloaded.last.score, 0);
  assert.equal(reloaded.best, 140);
  assert.equal(reloaded.initials, "OM9");
  assert.equal(reloaded.muted, true);
  assert.deepEqual(Array.from(reloaded.entries.slice(1, 3), entry => entry.initials), ["OM9", "A12"]);
  assert.equal(data.get("unrelated"), "unchanged");
});

test("Heat Sink ignores malformed scores and still remembers a run when local storage is blocked", () => {
  const blocked = { window: { get localStorage() { throw new Error("blocked"); } } };
  const store = load("heatSinkStorage", blocked);
  assert.equal(store.parseHeatSinkProfile("{not-json").best, 0);
  const parsed = store.parseHeatSinkProfile('{"best":100000,"entries":[{"score":-1,"at":1},{"score":10,"initials":"a?/b","at":42},{"score":100}],"last":{"score":"20","at":4}}');
  assert.equal(parsed.best, 10);
  assert.equal(parsed.entries[0].initials, "AB");
  assert.equal(parsed.last, null);
  const profile = store.recordHeatSinkScore(store.readHeatSinkProfile(), 30, "OM", 42);
  assert.equal(store.writeHeatSinkProfile(profile), false);
  assert.equal(store.readHeatSinkProfile().best, 30);
});

function mockAudio() {
  let resumes = [], created = 0, closed = false;
  const sources = [];
  const context = {
    state: "suspended", sampleRate: 24_000,
    createGain: () => ({ gain: {}, connect() {}, disconnect() {} }),
    createBuffer: () => ({ copyToChannel() {} }),
    createBufferSource() {
      const source = { started: false, stopped: false, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } };
      sources.push(source);
      return source;
    },
    resume: () => new Promise(resolve => resumes.push(resolve)),
    close: () => { closed = true; context.state = "closed"; return Promise.resolve(); },
  };
  const engine = load("heatSinkAudio").createHeatSinkAudio(() => { created++; return context; });
  return {
    engine, sources, get created() { return created; }, get closed() { return closed; },
    async resume() { context.state = "running"; for (const resolve of resumes) resolve(); resumes = []; await Promise.resolve(); },
  };
}

test("Heat Sink audio stays locked until input and drops an outstanding record cheer when muted", async () => {
  const h = mockAudio();
  h.engine.play("move");
  assert.equal(h.created, 0);
  h.engine.unlock();
  h.engine.play("high-score");
  h.engine.setMuted(true);
  await h.resume();
  assert.equal(h.sources.length, 0);
  h.engine.setMuted(false);
  h.engine.play("pickup", 3);
  assert.equal(h.sources[0].started, true);
  h.engine.dispose();
  assert.equal(h.sources[0].stopped, true);
  assert.equal(h.closed, true);
});

test("rapid movement preserves the record cheer within the voice limit; pause still silences it", async () => {
  const h = mockAudio();
  h.engine.unlock();
  await h.resume();
  h.engine.play("high-score");
  for (let i = 0; i < 12; i++) h.engine.play("move");
  assert.equal(h.sources.filter(voice => !voice.stopped).length, 4);
  assert.equal(h.sources[0].stopped, false);
  h.engine.silence();
  assert.ok(h.sources.every(voice => voice.stopped));
  h.engine.dispose();
});
