import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the production hook's effect/event wiring with a minimal controlled
// React-effect harness. This does not simulate a browser camera or claim device
// compatibility; the real CameraSession controller is covered in its own suite.
const filename = fileURLToPath(new URL("../src/components/webcam/useCameraSession.ts", import.meta.url));
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

class PageEvents extends EventTarget {
  hidden = false;
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
  emit(name) { this.dispatchEvent(new Event(name)); }
  count(name) { return this.listeners.get(name)?.size ?? 0; }
}

function harness() {
  const document = new PageEvents();
  const page = new PageEvents();
  const timers = new Map();
  const stateSlots = [];
  const effects = [];
  const instances = [];
  let nextTimer = 0, stateCursor = 0, effectCursor = 0, scheduled = [];
  class FakeCameraSession {
    calls = [];
    videoSources = [];
    active = false;
    constructor(getVideo) { this.getVideo = getVideo; instances.push(this); }
    subscribe = () => () => {};
    getSnapshot = () => ({ status: this.active ? "live" : "paused", message: "fixture", permission: "unknown", liveTrack: this.active });
    setVideoSource(getVideo) { this.getVideo = getVideo; this.videoSources.push(getVideo); }
    setActive(value) { this.calls.push(value); this.active = value; }
  }
  const react = {
    useState(initializer) {
      const index = stateCursor++;
      if (!(index in stateSlots)) stateSlots[index] = typeof initializer === "function" ? initializer() : initializer;
      return [stateSlots[index], value => { stateSlots[index] = value; }];
    },
    useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
    useEffect(setup, deps) {
      const index = effectCursor++;
      const previous = effects[index];
      if (!previous || deps.some((value, offset) => !Object.is(value, previous.deps[offset]))) {
        scheduled.push({ index, setup, deps });
      }
    },
  };
  const loadedModule = { exports: {} };
  runInNewContext(`(function(module, exports, require) { ${compiled}\n})(module, module.exports, require)`, {
    module: loadedModule,
    require(specifier) {
      if (specifier === "react") return react;
      if (specifier === "./CameraSession") return { CameraSession: FakeCameraSession };
      throw new Error(`Unexpected dependency ${specifier}`);
    },
    document,
    addEventListener: page.addEventListener.bind(page),
    removeEventListener: page.removeEventListener.bind(page),
    setTimeout(callback, delay) {
      assert.equal(delay, 0, "the initial permission deferral should not introduce a visible waiting period");
      const id = ++nextTimer;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  }, { filename });
  const videoRef = { current: { fixture: "video" } };
  const commit = () => {
    for (const { index, setup, deps } of scheduled) {
      effects[index]?.cleanup?.();
      effects[index] = { setup, deps, cleanup: setup() };
    }
    scheduled = [];
  };
  return {
    document, page, videoRef, instances,
    get session() { return instances[0]; },
    get pendingTimers() { return timers.size; },
    render(windowAvailable, { applyEffects = true } = {}) {
      stateCursor = 0;
      effectCursor = 0;
      scheduled = [];
      const result = loadedModule.exports.useCameraSession(videoRef, windowAvailable);
      if (applyEffects) commit();
      return result;
    },
    commit,
    flushTimers() {
      const pending = [...timers.entries()];
      for (const [id, callback] of pending) {
        if (!timers.has(id)) continue;
        timers.delete(id);
        callback();
      }
    },
    strictModeRehearsal() {
      for (const effect of effects) { effect.cleanup?.(); effect.cleanup = effect.setup(); }
    },
    cleanup() { for (const effect of effects) { effect.cleanup?.(); effect.cleanup = null; } },
  };
}

test("the mounted video source is installed before deferred camera activation", () => {
  const h = harness();
  h.render(true);
  assert.equal(h.instances.length, 1);
  assert.equal(h.session.getVideo(), h.videoRef.current);
  assert.equal(h.session.calls.length, 0);
  assert.equal(h.pendingTimers, 1);
  h.flushTimers();
  assert.deepEqual(h.session.calls, [true]);
  h.cleanup();
});

test("pagehide before deferred startup cannot reactivate a suspended visible-looking page", () => {
  const h = harness();
  h.render(true);
  assert.equal(h.document.hidden, false, "pagehide can precede any hidden-state update");
  h.page.emit("pagehide");
  assert.deepEqual(h.session.calls, [false], "release happens synchronously inside the native event");
  h.flushTimers();
  assert.equal(h.session.calls.includes(true), false);
  h.document.emit("visibilitychange");
  assert.equal(h.session.active, false, "visibility alone must not undo pagehide suspension");
  h.cleanup();
});

test("pageshow reconciles the camera without requiring an intervening React render", () => {
  const h = harness();
  h.render(true);
  h.flushTimers();
  h.page.emit("pagehide");
  assert.equal(h.session.active, false);
  h.page.emit("pageshow");
  assert.equal(h.session.active, true);
  assert.deepEqual(h.session.calls, [true, false, true]);
  assert.equal(h.instances.length, 1);
  h.cleanup();
});

test("visibility hides release synchronously before effects; visibility restore resumes when allowed", () => {
  const h = harness();
  h.render(true);
  h.flushTimers();
  h.document.hidden = true;
  h.document.emit("visibilitychange");
  assert.equal(h.session.active, false);
  assert.deepEqual(h.session.calls, [true, false]);
  assert.equal(h.pendingTimers, 0, "release is not delegated to a later timer or render");
  h.page.emit("pageshow");
  assert.equal(h.session.active, false, "pageshow must respect document.hidden");
  h.document.hidden = false;
  h.document.emit("visibilitychange");
  assert.equal(h.session.active, true);
  h.cleanup();
});

test("a minimized/closing window cannot resume from page or visibility events", () => {
  const h = harness();
  h.render(true);
  h.flushTimers();
  h.render(false);
  assert.equal(h.session.active, false, "the effect cleanup and minimized setup release immediately");
  const callsAfterMinimize = h.session.calls.length;
  h.page.emit("pagehide");
  h.page.emit("pageshow");
  h.document.hidden = true;
  h.document.emit("visibilitychange");
  h.document.hidden = false;
  h.document.emit("visibilitychange");
  h.flushTimers();
  assert.equal(h.session.calls.slice(callsAfterMinimize).includes(true), false);
  h.render(true);
  assert.equal(h.session.active, false, "window restoration uses the same deferred safe activation");
  h.flushTimers();
  assert.equal(h.session.active, true);
  h.cleanup();
});

test("cleanup removes all native listeners, cancels deferred startup, and releases immediately", () => {
  const h = harness();
  h.render(true);
  assert.equal(h.document.count("visibilitychange"), 1);
  assert.equal(h.page.count("pagehide"), 1);
  assert.equal(h.page.count("pageshow"), 1);
  h.cleanup();
  assert.equal(h.pendingTimers, 0);
  assert.equal(h.document.count("visibilitychange"), 0);
  assert.equal(h.page.count("pagehide"), 0);
  assert.equal(h.page.count("pageshow"), 0);
  assert.deepEqual(h.session.calls, [false]);
  h.flushTimers();
  h.page.emit("pageshow");
  h.page.emit("pagehide");
  h.document.emit("visibilitychange");
  assert.deepEqual(h.session.calls, [false], "stale native callbacks cannot re-enable an unmounted session");
});

test("StrictMode setup/cleanup rehearsal cancels the first timer and activates only once", () => {
  const h = harness();
  h.render(true);
  h.strictModeRehearsal();
  assert.equal(h.instances.length, 1);
  assert.equal(h.pendingTimers, 1);
  assert.equal(h.document.count("visibilitychange"), 1);
  assert.equal(h.page.count("pagehide"), 1);
  assert.equal(h.page.count("pageshow"), 1);
  h.flushTimers();
  assert.deepEqual(h.session.calls, [false, true]);
  assert.equal(h.session.calls.filter(Boolean).length, 1);
  h.cleanup();
});

test("an initially hidden or minimized window never activates during deferred startup", () => {
  for (const mode of ["hidden", "minimized"]) {
    const h = harness();
    h.document.hidden = mode === "hidden";
    h.render(mode !== "minimized");
    h.flushTimers();
    assert.equal(h.session.active, false);
    assert.equal(h.session.calls.includes(true), false);
    h.cleanup();
  }
});
