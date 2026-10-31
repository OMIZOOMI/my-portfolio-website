import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const flush = () => new Promise(resolve => setImmediate(resolve));
function harness({ noContext = false, drawError = false } = {}) {
  const callbacks = new Map(), calls = [], observers = [], timers = new Map(), animationFrames = new Map(), drawnTimes = [];
  let serial = 0, ready = 0, failed = 0;
  const video = { currentTime: 0, readyState: 4, videoWidth: 1280, videoHeight: 720, paused: false, ended: false,
    requestVideoFrameCallback(callback) { callbacks.set(++serial, callback); return serial; },
    cancelVideoFrameCallback(id) { callbacks.delete(id); },
  };
  const context = { setTransform(...args) { calls.push(["transform", ...args]); }, drawImage(...args) { if (drawError) throw Error("draw blocked"); calls.push(["draw", ...args]); drawnTimes.push(video.currentTime); } };
  const canvas = { clientWidth: 640, clientHeight: 360, width: 300, height: 150, getContext() { return noContext ? null : context; } };
  const globals = { document: { visibilityState: "visible" }, devicePixelRatio: 2,
    setTimeout: (callback, ms) => { timers.set(++serial, { callback, ms }); return serial; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => { animationFrames.set(++serial, callback); return serial; },
    cancelAnimationFrame: id => animationFrames.delete(id),
    ResizeObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
  };
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const source = readFileSync(new URL(`../src/components/webcam/${name}.ts`, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const loaded = { exports: {} };
    runInNewContext(`(function(module,exports,require){${compiled}\n})(module,module.exports,require)`, { module: loaded, require: specifier => load(specifier.slice(2)), ...globals });
    cache.set(name, loaded.exports); return loaded.exports;
  }
  const api = load("cameraPreview");
  const stop = api.startCameraPreview(video, canvas, () => ready++, () => failed++);
  return { video, canvas, calls, observers, callbacks, timers, animationFrames, drawnTimes, stop, ...api, ready: () => ready, failed: () => failed,
    timeout(ms) { for (const [id,timer] of [...timers]) if (timer.ms===ms) {timers.delete(id);timer.callback();} },
    async animation(now, mediaTime=now/1000) { video.currentTime=mediaTime;const pending=[...animationFrames.values()];animationFrames.clear();for(const callback of pending)callback(now);await flush(); },
    async frame(now, mediaTime = now / 1000) {
      video.currentTime = mediaTime;
      const pending = [...callbacks.values()]; callbacks.clear();
      for (const callback of pending) callback(now, { mediaTime });
      await flush();
    },
  };
}

test("camera preview paints new frames, mirrors once, and bounds the backing resolution", async () => {
  const h = harness();
  assert.deepEqual([h.canvas.width, h.canvas.height], [960, 540]);
  await h.frame(0, 1); await h.frame(100, 1); await h.frame(200, 2);
  assert.equal(h.calls.filter(call => call[0] === "draw").length, 2);
  assert.deepEqual(h.calls[0], ["transform", -1, 0, 0, 1, 960, 0]);
  assert.equal(h.ready(), 1); assert.equal(h.failed(), 0);
  assert.equal(h.timers.size, 1, "only the next callback's stall watchdog remains");
  h.stop(); assert.equal(h.callbacks.size, 0);
  assert.ok(h.observers[0].disconnected);
  assert.deepEqual([h.canvas.width, h.canvas.height], [0, 0], "discard private camera pixels on cleanup");
});
test("cover crop keeps the subject centered without stretching", () => {
  const h = harness();
  const wide = h.cameraCoverCrop(1280, 720, 640, 200);
  assert.equal(wide.sx, 0); assert.equal(wide.sy, 160); assert.equal(wide.sw, 1280); assert.equal(wide.sh, 400);
  const tall = h.cameraCoverCrop(1280, 720, 300, 400);
  assert.equal(tall.sy, 0); assert.equal(tall.sh, 720); assert.equal(tall.sw, 540); assert.equal(tall.sx, 370);
  h.stop();
});
test("preview callbacks are capped at 30Hz and resizing stays bounded", async () => {
  const h = harness();
  for (let now = 0; now <= 1000; now += 1000 / 60) await h.frame(now);
  const count = h.calls.filter(call => call[0] === "draw").length;
  assert.ok(count >= 29 && count <= 31, count);
  h.canvas.clientWidth = 2000; h.canvas.clientHeight = 1000; h.observers[0].callback();
  assert.ok(h.canvas.width <= 960 && h.canvas.height <= 540);
  h.stop();
});
test("drawing failure and unavailable context remain actionable without retry loops", async () => {
  const h = harness({ drawError: true }); await h.frame(0);
  assert.equal(h.failed(), 1); assert.equal(h.ready(), 0); assert.equal(h.callbacks.size, 0); h.stop();
  const missing = harness({ noContext: true });
  assert.equal(missing.failed(), 1); assert.equal(missing.callbacks.size, 0); missing.stop();
});
test("closing before a queued callback cannot paint or report ready later", async () => {
  const h = harness(); const late = [...h.callbacks.values()][0]; h.stop();
  late(200, { mediaTime: 1 }); await flush();
  assert.equal(h.calls.length, 0); assert.equal(h.ready(), 0); assert.equal(h.callbacks.size, 0);
  assert.equal(h.timers.size, 0);
});
test("live video without delivered frames times out to an actionable preview error",()=>{
  const h=harness();h.timeout(8000);
  assert.equal(h.failed(),1);assert.equal(h.callbacks.size,0);assert.equal(h.ready(),0);h.stop();
});
test("preview continues drawing changing input when native callbacks freeze after its first frame",async()=>{
  const h=harness();await h.frame(0,0);h.timeout(350);
  await h.animation(400,.4);await h.animation(450,.45);await h.animation(500,.5);
  assert.deepEqual(h.drawnTimes,[0,.4,.45,.5]);assert.equal(h.failed(),0);assert.equal(h.ready(),1);
  h.stop();assert.equal(h.animationFrames.size,0);assert.equal(h.timers.size,0);
  h.observers[0].callback();assert.equal(h.canvas.width,0,"a retired resize callback cannot allocate camera pixels");
});
