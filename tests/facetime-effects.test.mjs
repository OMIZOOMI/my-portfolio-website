import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Render the actual FaceTimeApp TSX into structural elements with controlled
// hook state. This verifies callback-to-UI wiring, not React DOM animation,
// MediaPipe inference, a physical camera, or Windows/Safari compatibility.
const filename = fileURLToPath(new URL("../src/components/desktop/FaceTimeApp.tsx", import.meta.url));
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

function walk(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => walk(child, predicate));
  if (!node || typeof node !== "object") return [];
  return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node && typeof node === "object" ? text(node.props?.children) : "";
}

function harness({ reducedMotion = false } = {}) {
  const states = [], refs = [], effects = [], timers = new Map();
  let stateCursor = 0, refCursor = 0, effectCursor = 0, serial = 0, pending = [], detector, view;
  let win = { id: "app-facetime", title: "FaceTime" };
  let camera = { status: "live", liveTrack: true, generation: 1, permission: "granted", message: "Camera is live", session: { setEnabled() {}, retry() {}, resumePlayback() {} } };
  const document = { hidden: false };
  function ConfettiBurst() {}
  function FloatingLikes() {}
  function Icon() {}
  const react = {
    Component: class {},
    useState(initial) {
      const index = stateCursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], update => { states[index] = typeof update === "function" ? update(states[index]) : update; }];
    },
    useRef(initial) {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
    useCallback(callback) { return callback; },
    useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
    useEffect(setup, deps) {
      const index = effectCursor++;
      if (!effects[index] || deps.some((item, offset) => !Object.is(item, effects[index].deps[offset]))) pending.push({ index, setup, deps });
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const dependencies = {
    react: { __esModule: true, default: react, ...react },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "lucide-react": new Proxy({}, { get: () => Icon }),
    "./FaceTimeApp.module.css": new Proxy({}, { get: (_target, key) => key === "__esModule" ? false : String(key) }),
    "../window-manager/useWindowStore": { useWindowStore: selector => selector({ closeWindow() {} }) },
    "../window-manager/useSystemStore": { useSystemStore: selector => selector({ reduceMotion: reducedMotion }) },
    "../webcam/useHandGestureDetector": { useHandGestureDetector: options => { detector = options; } },
    "../webcam/useCameraSession": { useCameraSession: () => camera },
    "../webcam/cameraPreview": { startCameraPreview() { return () => {}; } },
    "../webcam/ConfettiBurst": { ConfettiBurst },
    "./FaceTimeEffects": { FloatingLikes },
    "./useSmoothScroll": { useSmoothScroll() {} },
  };
  const loadedModule = { exports: {} };
  runInNewContext(`(function(module, exports, require) { ${compiled}\n})(module, module.exports, require)`, {
    module: loadedModule, document,
    require(specifier) {
      if (!(specifier in dependencies)) throw new Error(`Unexpected dependency ${specifier}`);
      return dependencies[specifier];
    },
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  }, { filename });
  const render = () => {
    stateCursor = refCursor = effectCursor = 0;
    pending = [];
    const boundary = loadedModule.exports.FaceTimeApp({ window: win });
    const content = boundary.props.children;
    view = content.type(content.props);
    for (const { index, setup, deps } of pending) {
      effects[index]?.cleanup?.();
      effects[index] = { deps, cleanup: setup() };
    }
    return view;
  };
  render();
  return {
    render, document, ConfettiBurst, FloatingLikes,
    get view() { return view; },
    get detector() { return detector; },
    get timerCount() { return timers.size; },
    find(type) { return walk(view, node => node.type === type); },
    text: () => text(view),
    ready() { detector.onReady("CPU"); render(); },
    gesture(gesture) { detector.onGesture(gesture); render(); },
    update({ camera: nextCamera, window: nextWindow } = {}) {
      if (nextCamera) camera = { ...camera, ...nextCamera };
      if (nextWindow) win = { ...win, ...nextWindow };
      return render();
    },
    finishLabel() {
      for (const [id, timer] of [...timers]) {
        assert.equal(timer.delay, 1800);
        timers.delete(id);
        timer.callback();
      }
      render();
    },
    cleanup() { for (const effect of effects) effect.cleanup?.(); },
  };
}

test("actual peace callback renders ConfettiBurst and the peace detection badge", () => {
  const h = harness();
  h.ready();
  assert.equal(h.detector.enabled, true);
  h.gesture("peace");
  assert.equal(h.find(h.ConfettiBurst).length, 1);
  assert.equal(h.find(h.FloatingLikes).length, 0);
  assert.ok(h.text().includes("✌️ Peace sign detected"));
  assert.ok(!h.text().includes("👍 Thumbs up detected"));
  assert.equal(h.view.props["data-gesture-delegate"], "CPU");
  h.cleanup();
});

test("actual thumbs-up callback renders FloatingLikes and the thumbs-up detection badge", () => {
  const h = harness();
  h.ready();
  h.gesture("thumbsup");
  assert.equal(h.find(h.ConfettiBurst).length, 0);
  assert.equal(h.find(h.FloatingLikes).length, 1);
  assert.equal(h.find(h.FloatingLikes)[0].props.burstKey, 1);
  assert.ok(h.text().includes("👍 Thumbs up detected"));
  assert.ok(!h.text().includes("✌️ Peace sign detected"));
  h.cleanup();
});

test("reduced motion retains the correct detection badge while suppressing both animated effects", () => {
  for (const [gesture, label] of [["peace", "✌️ Peace sign detected"], ["thumbsup", "👍 Thumbs up detected"]]) {
    const h = harness({ reducedMotion: true });
    h.ready();
    h.gesture(gesture);
    assert.equal(h.find(h.ConfettiBurst).length, 0);
    assert.equal(h.find(h.FloatingLikes).length, 0);
    assert.ok(h.text().includes(label));
    h.finishLabel();
    assert.ok(!h.text().includes(label));
    h.cleanup();
  }
});

test("a new camera generation hides old effects and labels and cancels their pending label timer", () => {
  const h = harness();
  h.gesture("peace");
  assert.equal(h.find(h.ConfettiBurst).length, 1);
  assert.equal(h.timerCount, 1);
  h.update({ camera: { generation: 2 } });
  assert.equal(h.find(h.ConfettiBurst).length, 0);
  assert.equal(h.find(h.FloatingLikes).length, 0);
  assert.ok(!h.text().includes("✌️ Peace sign detected"));
  assert.equal(h.timerCount, 0);
  h.gesture("thumbsup");
  assert.equal(h.find(h.FloatingLikes)[0].props.burstKey, 1);
  assert.ok(h.text().includes("👍 Thumbs up detected"));
  h.cleanup();
});

test("pause, minimize, close and native hidden snapshots suppress effects and disable the detector", () => {
  for (const mode of ["paused", "minimized", "closing", "hidden"]) {
    const h = harness();
    h.gesture("peace");
    if (mode === "paused") h.update({ camera: { status: "paused", liveTrack: false, generation: 2 } });
    if (mode === "minimized") h.update({ window: { minimized: true } });
    if (mode === "closing") h.update({ window: { closing: true } });
    if (mode === "hidden") { h.document.hidden = true; h.render(); }
    assert.equal(h.detector.enabled, false);
    assert.equal(h.find(h.ConfettiBurst).length, 0);
    assert.equal(h.find(h.FloatingLikes).length, 0);
    assert.ok(!h.text().includes("✌️ Peace sign detected"));
    assert.equal(h.timerCount, 0);
    h.cleanup();
  }
});

test("manual preview control produces confetti without claiming a detected gesture and is ignored while paused", () => {
  const h = harness();
  const press = label => { const button=h.find("button").find(node => node.props["aria-label"]===label || text(node)===label); assert.ok(button, label); button.props.onClick(); h.render(); };
  press("Gesture help");
  press("Preview confetti");
  h.render();
  assert.equal(h.find(h.ConfettiBurst).length, 1);
  assert.equal(h.find(h.FloatingLikes).length, 0);
  assert.ok(!h.text().includes("✌️ Peace sign detected"));
  assert.ok(!h.text().includes("👍 Thumbs up detected"));
  h.update({ camera: { status: "paused", liveTrack: false, generation: 2 } });
  press("Preview confetti");
  h.render();
  assert.equal(h.find(h.ConfettiBurst).length, 0);
  assert.equal(h.timerCount, 0);
  h.cleanup();
});

test("effects off pauses inference and enabling it cannot replay a prior burst",()=>{
 const h=harness();h.gesture('peace');assert.equal(h.find(h.ConfettiBurst).length,1);
 const press=label=>{const b=h.find('button').find(n=>n.props['aria-label']===label);assert.ok(b);b.props.onClick();h.render();};
 press('Turn effects off');assert.equal(h.detector.enabled,false);assert.equal(h.find(h.ConfettiBurst).length,0);assert.equal(h.timerCount,0);
 press('Turn effects on');assert.equal(h.detector.enabled,true);assert.equal(h.find(h.ConfettiBurst).length,0);assert.ok(!h.text().includes('Peace sign detected'));
 h.gesture('thumbsup');assert.equal(h.find(h.FloatingLikes).length,1);press('Reduced motion');assert.equal(h.find(h.FloatingLikes).length,0);assert.ok(h.text().includes('Thumbs up detected'));
 press('Reduced motion');assert.equal(h.find(h.FloatingLikes).length,0);h.cleanup();
});
