import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../src/components/webcam/videoFrameScheduler.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness({ fallback = false, process, throws = false } = {}) {
  const frames = new Map(), videoFrames = new Map(), calls = [], cancelled = [], timers = new Map();
  let serial = 0, clock = 0;
  const document = { visibilityState: "visible" };
  const video = { currentTime: 0, readyState: 4, videoWidth: 640, paused: false, ended: false,
    requestVideoFrameCallback: fallback ? undefined : callback => { if (throws) throw Error('callback unavailable'); const id = ++serial; videoFrames.set(id, callback); return id; },
    cancelVideoFrameCallback: id => { cancelled.push(id); videoFrames.delete(id); },
  };
  const loadedModule = { exports: {} };
  runInNewContext(`(function(module,exports){${source}\n})(module,module.exports)`, {
    module: loadedModule, document,
    requestAnimationFrame: callback => { const id = ++serial; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (callback, ms) => { const id = ++serial; timers.set(id,{callback,at:clock+ms});return id; },
    clearTimeout: id => timers.delete(id),
  });
  const scheduler = loadedModule.exports.createVideoFrameScheduler(() => video, async now => { calls.push(now); await process?.(); });
  return { video, document, scheduler, calls, cancelled, frames, videoFrames, timers,
    async frame(now, mediaTime = now / 1000, currentTime = mediaTime) {
      clock = now;
      video.currentTime = currentTime;
      const callbacks = [...(fallback ? frames : videoFrames).values()];
      (fallback ? frames : videoFrames).clear();
      for (const callback of callbacks) callback(now, { mediaTime });
      await flush();
    },
    async animation(now, mediaTime=now/1000) {
      clock=now;video.currentTime=mediaTime;
      const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(now);
      await flush();
    },
    async advance(ms) {
      const until=clock+ms;
      for(;;){const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>until)break;timers.delete(next[0]);clock=next[1].at;next[1].callback();await flush();}
      clock=until;
    },
  };
}
test("new video frames drive inference at the measured 10 fps cap", async () => {
  const h = harness(); h.scheduler.start(); h.scheduler.start();
  assert.equal(h.videoFrames.size, 1); assert.equal(h.frames.size, 0);
  for (let now = 0; now <= 1000; now += 1000 / 30) await h.frame(now);
  assert.ok(h.calls.length >= 10 && h.calls.length <= 11);
  for (let index = 1; index < h.calls.length; index++) assert.ok(h.calls[index] - h.calls[index - 1] >= 99);
  h.scheduler.stop(); assert.equal(h.videoFrames.size, 0);
});
test("duplicate frame metadata cannot run another inference even after the cap expires", async () => {
  const h = harness(); h.scheduler.start();
  await h.frame(0, 1); await h.frame(200, 1); await h.frame(400, 1);
  assert.equal(h.calls.length, 1); await h.frame(500, 2); assert.equal(h.calls.length, 2);
  h.scheduler.stop();
});
test("the RAF fallback only processes changed currentTime and cleans up", async () => {
  const h = harness({ fallback: true }); h.scheduler.start();
  await h.frame(0, 0); await h.frame(200, 0); await h.frame(400, 1);
  assert.equal(h.calls.length, 2); assert.equal(h.frames.size, 1);
  h.scheduler.stop(); assert.equal(h.frames.size, 0);
});
test("hidden, paused, ended and unready video frames are skipped", async () => {
  const h = harness(); h.scheduler.start();
  h.document.visibilityState = "hidden"; await h.frame(0);
  h.document.visibilityState = "visible"; h.video.paused = true; await h.frame(200);
  h.video.paused = false; h.video.ended = true; await h.frame(400);
  h.video.ended = false; h.video.readyState = 1; await h.frame(600);
  assert.equal(h.calls.length, 0); h.video.readyState = 4; await h.frame(800); assert.equal(h.calls.length, 1);
  h.scheduler.stop();
});
test("a pending inference/recovery has backpressure and cannot restart after cleanup", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({ process: () => pending }); h.scheduler.start(); await h.frame(0);
  assert.equal(h.calls.length, 1); assert.equal(h.videoFrames.size, 0);
  h.scheduler.stop(); finish(); await flush();
  assert.equal(h.videoFrames.size, 0); assert.equal(h.frames.size, 0);
});
test("cleanup cancels the callback on the owning video, and late callbacks are harmless", async () => {
  const h = harness(); h.scheduler.start(); const late = [...h.videoFrames.values()][0];
  h.scheduler.stop(); assert.equal(h.cancelled.length, 1);
  late(100, { mediaTime: 1 }); await flush(); assert.equal(h.calls.length, 0); assert.equal(h.videoFrames.size, 0);
});
test("a frame API that delivers once then goes silent falls back and keeps live input moving",async()=>{
  const h=harness();h.scheduler.start();await h.frame(0,0);
  const late=[...h.videoFrames.values()][0];
  await h.advance(400);assert.equal(h.videoFrames.size,0);assert.equal(h.frames.size,1);
  await h.animation(400,.4);await h.animation(500,.5);await h.animation(600,.5);
  assert.deepEqual(h.calls,[0,400,500]);
  late(700,{mediaTime:.7});await flush();assert.equal(h.frames.size,1);assert.equal(h.calls.length,3);
  h.scheduler.stop();assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);
});
test("present-but-silent or throwing video callbacks cannot prevent first inference",async()=>{
  const silent=harness();silent.scheduler.start();await silent.advance(400);await silent.animation(400,.4);
  assert.equal(silent.calls.length,1);silent.scheduler.stop();
  const broken=harness({throws:true});assert.doesNotThrow(()=>broken.scheduler.start());
  await broken.animation(0,0);assert.equal(broken.calls.length,1);broken.scheduler.stop();
});
test("stale callback metadata with a progressing video also switches to the capped fallback",async()=>{
  const h=harness();h.scheduler.start();await h.frame(0,1);await h.frame(200,1,1.2);await h.frame(400,1,1.4);
  assert.deepEqual(h.calls,[0,400]);assert.equal(h.frames.size,1);assert.equal(h.videoFrames.size,0);
  await h.animation(500,1.5);assert.deepEqual(h.calls,[0,400,500]);h.scheduler.stop();
});
test("stop/restart during an async inference never creates competing operations",async()=>{
  let finish,concurrent=0,maximum=0;
  const pending=new Promise(resolve=>finish=resolve);
  const h=harness({process:async()=>{concurrent++;maximum=Math.max(maximum,concurrent);await pending;concurrent--;}});
  h.scheduler.start();await h.frame(0);h.scheduler.stop();h.scheduler.start();
  await h.frame(200);assert.equal(h.calls.length,1);finish();await flush();
  assert.equal(h.videoFrames.size,1);await h.frame(400);assert.equal(maximum,1);
  h.scheduler.stop();assert.equal(h.timers.size,0);
});
