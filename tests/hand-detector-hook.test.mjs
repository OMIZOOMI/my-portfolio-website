import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { handPose } from "./fixtures/hand-landmarks.mjs";

// These are lifecycle simulations of the real hook with a simulated native
// MediaPipe task. They are not camera, driver, Safari, or Windows hardware runs.
const root = fileURLToPath(new URL("../", import.meta.url));
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

function harness({ nativeFrames = false } = {}) {
  let clock = 0, serial = 0, refIndex = 0, effectIndex = 0;
  const timers = new Map(), frames = new Map(), videoFrames = new Map(), refs = [], effects = [], pendingEffects = [];
  const created = [], canvasNodes = [], fetches = [], nativeCalls = [];
  const statuses = [], ready = [], errors = [], gestures = [];
  let assetBlocked = false;
  let nativeFactory = null;
  let runtimeFailure = null;
  let landmarks = [];
  const loaderScripts = [];
  const doc = {
    scripts: [],
    baseURI: "http://localhost/",
    visibilityState: "visible",
    createElement() {
      const canvas = new EventTarget();
      canvas.width = 300; canvas.height = 150;
      canvasNodes.push(canvas);
      return canvas;
    },
  };
  const setTimer = (callback, ms) => { const id = ++serial; timers.set(id, { at: clock + ms, callback }); return id; };
  const video = { paused: false, ended: false, readyState: 4, videoWidth: 640, currentTime: 0 };
  if (nativeFrames) {
    video.requestVideoFrameCallback = callback => {const id=++serial;videoFrames.set(id,callback);return id;};
    video.cancelVideoFrameCallback = id => videoFrames.delete(id);
  }
  const videoRef = { current: video };
  const react = {
    useRef(value) { return refs[refIndex++] ??= { current: value }; },
    useEffect(callback, dependencies) {
      const index = effectIndex++;
      const prior = effects[index];
      if (!prior || dependencies.some((value, offset) => !Object.is(value, prior.dependencies[offset]))) {
        pendingEffects.push(() => {
          prior?.cleanup?.();
          effects[index] = { dependencies, cleanup: callback() };
        });
      }
    },
  };
  function task(delegate) {
    const instance = {
      delegate, closed: 0, detections: 0,
      detectForVideo() {
        this.detections++;
        if (runtimeFailure === delegate) throw new Error(`${delegate} inference failed`);
        return { landmarks, worldLandmarks: [], handedness: [] };
      },
      close() { this.closed++; },
    };
    created.push(instance);
    return instance;
  }
  const mediapipe = {
    FilesetResolver: {
      async forVisionTasks(path) { return { wasmLoaderPath: `${path}/vision_wasm_internal.js`, wasmBinaryPath: `${path}/vision_wasm_internal.wasm` }; },
    },
    HandLandmarker: {
      async createFromOptions(_files, options) {
        const script={onload:()=>{},onerror:()=>{},src:new URL(_files.wasmLoaderPath,doc.baseURI).href,getAttribute(){return this.src},remove(){doc.scripts.splice(doc.scripts.indexOf(script),1)}};
        doc.scripts.push(script);loaderScripts.push(script);
        nativeCalls.push(options);
        return nativeFactory ? nativeFactory(options.baseOptions.delegate, task) : task(options.baseOptions.delegate);
      },
    },
  };
  const context = createContext({
    console, AbortController, DOMException, Uint8Array, Event, EventTarget, URL,
    document: doc, performance: { now: () => clock },
    setTimeout: setTimer, clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (callback) => { const id = ++serial; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    fetch: async (url, options) => {
      fetches.push({ url, signal: options.signal });
      if (options.signal.aborted) throw new DOMException("Stopped", "AbortError");
      return { ok: !assetBlocked, status: assetBlocked ? 404 : 200, headers: { get: () => "4" }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
    },
  });
  const modules = new Map();
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const loadedModule = { exports: {} };
    modules.set(filename, loadedModule);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const localRequire = (specifier) => {
      if (specifier === "react") return react;
      if (specifier === "@mediapipe/tasks-vision") return mediapipe;
      return load(resolve(dirname(filename), `${specifier}.ts`));
    };
    runInContext(`(function(module, exports, require) { ${source}\n})`, context, { filename })(loadedModule, loadedModule.exports, localRequire);
    return loadedModule.exports;
  }
  const { useHandGestureDetector: runDetectorHook } = load(resolve(root, "src/components/webcam/useHandGestureDetector.ts"));
  const defaults = {
    videoRef, enabled: true, retryKey: 0,
    onStatus: (status) => statuses.push(status),
    onReady: (delegate) => ready.push(delegate),
    onError: (error) => errors.push(error),
    onGesture: (gesture) => gestures.push(gesture),
  };
  let options = defaults;
  function render(update = {}) {
    options = { ...options, ...update };
    refIndex = 0; effectIndex = 0;
    runDetectorHook(options);
    while (pendingEffects.length) pendingEffects.shift()();
  }
  return {
    render, video, doc, created, canvasNodes, fetches, nativeCalls, statuses, ready, errors, gestures, loaderScripts,
    task,
    set factory(value) { nativeFactory = value; },
    set blocked(value) { assetBlocked = value; },
    set runtimeFailure(value) { runtimeFailure = value; },
    set pose(value) { landmarks = value ? [handPose(value)] : []; },
    get pendingFrames() { return frames.size+videoFrames.size; },
    unmount() { for (const effect of effects) effect?.cleanup?.(); },
    async frame(advance = 100) {
      clock += advance;
      video.currentTime += advance / 1000;
      const pending = [...frames.values()]; frames.clear();
      const native = [...videoFrames.values()]; videoFrames.clear();
      for (const callback of pending) callback(clock);
      for (const callback of native) callback(clock,{mediaTime:video.currentTime});
      await flush();
    },
    async advance(ms) {
      const until = clock + ms;
      while (true) {
        const entry = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry || entry[1].at > until) break;
        const [id, timer] = entry;
        timers.delete(id); clock = timer.at; timer.callback(); await flush();
      }
      clock = until;
      await flush();
    },
  };
}

test("model creation does not claim ready until inference succeeds; callback rerenders keep one task", async () => {
  const h = harness();
  h.render(); await flush();
  assert.equal(h.created.length, 1);
  assert.deepEqual(h.ready, []);
  const updatedReady = [];
  h.render({ onReady: (delegate) => updatedReady.push(delegate) });
  await h.frame();
  assert.deepEqual(updatedReady, ["GPU"]);
  assert.deepEqual(h.ready, []);
  assert.equal(h.created.length, 1);
  assert.equal(h.created[0].detections, 1);
  await h.frame(16);
  assert.equal(h.created[0].detections, 1, "inference is capped at 10 fps");
  h.doc.visibilityState = "hidden";
  await h.frame();
  assert.equal(h.created[0].detections, 1);
  h.unmount();
  assert.equal(h.created[0].closed, 1);
  assert.equal(h.pendingFrames, 0);
});
test("gesture classification continues after native frame delivery stops, with one detector",async()=>{
  const h=harness({nativeFrames:true});h.render();await flush();await h.frame();
  assert.deepEqual(h.ready,["GPU"]);assert.equal(h.created[0].detections,1);
  // Stop delivering native callbacks. The real scheduler must detect the stall.
  await h.advance(400);h.pose="peace";
  for(let i=0;i<4;i++)await h.frame();
  assert.deepEqual(h.gestures,["peace"]);
  h.pose=null;await h.frame();await h.advance(2600);h.pose="thumbsup";
  for(let i=0;i<4;i++)await h.frame();
  assert.deepEqual(h.gestures,["peace","thumbsup"]);
  assert.equal(h.created.length,1);assert.equal(h.errors.length,0);
  h.unmount();assert.equal(h.pendingFrames,0);assert.equal(h.created[0].closed,1);
});

test("GPU initialization refusal uses CPU and only a successful CPU frame becomes ready", async () => {
  const h = harness();
  h.factory = async (delegate, task) => {
    if (delegate === "GPU") throw new Error("GPU unavailable");
    return task(delegate);
  };
  h.render(); await flush();
  assert.deepEqual(h.statuses, ["loading", "fallback"]);
  assert.deepEqual(h.ready, []);
  await h.frame();
  assert.deepEqual(h.ready, ["CPU"]);
  assert.equal(h.nativeCalls.length, 2);
  assert.equal(h.nativeCalls[0].canvas.width, 0, "failed GPUcanvas is cleared");
  assert.equal(h.nativeCalls[1].canvas, undefined);
  h.unmount();
  assert.equal(h.created[0].closed, 1);
});

test("GPU context loss uses the existing CPU replacement path; failed CPU inference stops the loop", async () => {
  const h = harness();
  h.render(); await flush(); await h.frame();
  assert.deepEqual(h.ready, ["GPU"]);
  h.canvasNodes[0].dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  for (let index = 0; index < 3; index++) await h.frame();
  assert.equal(h.created[0].closed, 1);
  assert.equal(h.created.length, 2);
  assert.equal(h.created[1].delegate, "CPU");
  await h.frame();
  assert.deepEqual(h.ready, ["GPU", "CPU"]);
  h.runtimeFailure = "CPU";
  for (let index = 0; index < 3; index++) await h.frame();
  assert.equal(h.errors.length, 1);
  assert.equal(h.statuses.at(-1), "failed");
  assert.equal(h.created[1].closed, 1);
  assert.equal(h.pendingFrames, 0);
  h.unmount();
});

test("failed asset loading never starts native initialization and a changed retry key recovers", async () => {
  const h = harness();
  h.blocked = true;
  h.render(); await flush();
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0].message, /404/);
  assert.equal(h.nativeCalls.length, 0);
  assert.equal(h.pendingFrames, 0);
  h.blocked = false;
  h.render({ retryKey: 1 }); await flush(); await h.frame();
  assert.deepEqual(h.ready, ["GPU"]);
  assert.equal(h.created.length, 1);
  h.unmount();
});

test("initialization watchdog reports failure, preserves exclusivity, and closes a late task before retry", async () => {
  const h = harness(), pending = deferred();
  let calls = 0;
  h.factory = async (delegate, task) => {
    calls++;
    return calls === 1 ? pending.promise : task(delegate);
  };
  h.render(); await flush();
  await h.advance(20_000);
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0].message, /too long/);
  assert.equal(h.pendingFrames, 0);
  h.render({ retryKey: 1 }); await flush();
  assert.equal(h.statuses.at(-1), "busy");
  assert.equal(calls, 1);
  const late = h.task("late GPU");
  pending.resolve(late); await flush();
  assert.equal(late.closed, 1);
  assert.equal(calls, 2);
  await h.frame();
  assert.deepEqual(h.ready, ["GPU"]);
  h.unmount();
});

test("minimize/restore during pending creation cannot run two tasks or publish stale readiness", async () => {
  const h = harness(), pending = deferred();
  let calls = 0;
  h.factory = async (delegate, task) => (++calls === 1 ? pending.promise : task(delegate));
  h.render(); await flush();
  h.render({ enabled: false });
  h.render({ enabled: true }); await flush();
  assert.equal(calls, 1);
  assert.equal(h.statuses.at(-1), "busy");
  const late = h.task("cancelled GPU");
  pending.resolve(late); await flush();
  assert.equal(late.closed, 1);
  assert.equal(calls, 2);
  await h.frame();
  assert.deepEqual(h.ready, ["GPU"]);
  h.unmount();
});

test("waiting for a never-settling previous task also has a bounded, truthful retry status", async () => {
  const h = harness(), pending = deferred();
  h.factory = async () => pending.promise;
  h.render(); await flush();
  h.render({ enabled: false }); h.render({ enabled: true }); await flush();
  assert.equal(h.statuses.at(-1), "busy");
  await h.advance(20_000);
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0].message, /Another gesture session is still finishing/);
  assert.equal(h.nativeCalls.length, 1);
  assert.equal(h.pendingFrames, 0);
  const late = h.task("old"); pending.resolve(late); await flush();
  assert.equal(late.closed, 1);
  h.unmount();
});

 test("completed owned runtime loader tags and their callbacks do not accumulate",async()=>{
  const h=harness();h.render();await flush();
  assert.equal(h.doc.scripts.length,0);assert.equal(h.loaderScripts.length,1);
  assert.equal(h.loaderScripts[0].onload,null);assert.equal(h.loaderScripts[0].onerror,null);
  h.render({enabled:false});h.render({enabled:true});await flush();
  assert.equal(h.doc.scripts.length,0);assert.equal(h.loaderScripts.length,2);h.unmount();
 });
