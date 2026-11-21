import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// Controlled React-effect wiring, not a physical camera/browser compatibility test.
function harness() {
  const page = new EventTarget(), document = new EventTarget(); document.hidden = false;
  const listeners = new Map(), effects = [], slots = [], instances = [];
  let cursor = 0, effectCursor = 0, pending = [];
  class Photo {
    state = { status: "idle", photo: null }; resets = 0; captures = [];
    constructor() { instances.push(this); }
    getSnapshot = () => this.state;
    subscribe = () => () => {};
    reset = () => { this.resets++; this.state = { status: "idle", photo: null }; };
    cancelPending = () => { if (this.state.status === "capturing") this.reset(); };
    capture = (...args) => { this.captures.push(args); return true; };
  }
  const effect = (setup, deps) => { const index = effectCursor++; if (!effects[index] || deps.some((v, i) => !Object.is(v, effects[index].deps[i]))) pending.push({ index, setup, deps }); };
  const react = { useState: factory => { const index = cursor++; slots[index] ??= factory(); return [slots[index], () => {}]; }, useSyncExternalStore: (_s, get) => get(), useEffect: effect, useLayoutEffect: effect };
  const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
  document.addEventListener = (name, callback) => { listeners.set(name, callback); add(name, callback); };
  document.removeEventListener = (name, callback) => { listeners.delete(name); remove(name, callback); };
  const filename = new URL("../src/components/webcam/useCameraPhoto.ts", import.meta.url);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = { exports: {} };
  runInNewContext(`(function(module,exports,require){${output}\n})(module,module.exports,require)`, { module: loaded, document,
    require: name => name === "react" ? react : { CameraPhotoCapture: Photo },
    addEventListener: page.addEventListener.bind(page), removeEventListener: page.removeEventListener.bind(page) });
  const videoRef = { current: {} }, canvasRef = { current: {} };
  return { document, page, listeners, instances,
    get session() { return instances[0]; },
    render(enabled, generation = 1, closing = false) {
      cursor = effectCursor = 0; pending = [];
      const result = loaded.exports.useCameraPhoto({ videoRef, canvasRef, enabled, generation, closing });
      for (const { index, setup, deps } of pending) { effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: setup() }; }
      return result;
    },
    cleanup() { effects.forEach(effect => effect.cleanup?.()); },
  };
}

test("photo hook cancels pending work on source/minimize changes without replacing its owner", () => {
  const h = harness(); let result = h.render(true); assert.equal(h.instances.length, 1);
  assert.equal(result.takePhoto(), true); h.session.state = { status: "capturing", photo: null };
  h.render(false, 2); assert.equal(h.session.state.status, "idle");
  result = h.render(false, 2); assert.equal(result.takePhoto(), false); assert.equal(h.instances.length, 1);
  h.render(true, 3); h.cleanup(); assert.equal(h.listeners.size, 0);
});
test("hidden tabs cancel encodes but retain one completed photo for native download/open handoffs", () => {
  const h = harness(); h.render(true); h.session.state = { status: "capturing", photo: null };
  h.document.hidden = true; h.document.dispatchEvent(new Event("visibilitychange")); assert.equal(h.session.state.status, "idle");
  const photo = { url: "blob:fixture" }; h.session.state = { status: "ready", photo };
  h.render(false, 2); h.document.dispatchEvent(new Event("visibilitychange")); assert.equal(h.session.state.photo, photo);
  h.page.dispatchEvent(new Event("pagehide")); assert.equal(h.session.state.photo, null);
  h.cleanup();
});
test("closing, unmount and repeated cleanup clear completed photos and listeners", () => {
  const h = harness(); h.render(true); h.session.state = { status: "ready", photo: { url: "blob:fixture" } };
  h.render(false, 2, true); assert.equal(h.session.state.photo, null);
  h.cleanup(); assert.equal(h.listeners.size, 0);
  const next = harness(); next.render(true); next.cleanup(); next.session.state = { status: "ready", photo: { url: "blob:fixture" } };
  next.cleanup(); assert.equal(next.session.state.photo, null);
});
