import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// Controlled event/effect execution; these fixtures do not claim browser paint,
// hardware gesture support, or measured frame-rate improvements.
function compile(path, imports = {}, globals = {}, jsx = false) {
  const loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText;
  runInNewContext(`(function(module,exports,require){${source}\n})(module,module.exports,require)`, {
    module: loaded, require: name => imports[name] ?? (() => { throw Error(`Unexpected import ${name}`); })(), ...globals,
  });
  return loaded.exports;
}

function frames() {
  let serial = 0;
  const callbacks = new Map();
  return {
    request(callback) { callbacks.set(++serial, callback); return serial; },
    cancel(id) { callbacks.delete(id); },
    tick() { const scheduled = [...callbacks]; callbacks.clear(); scheduled.forEach(([, callback]) => callback(16)); },
    get pending() { return callbacks.size; },
  };
}

test("frame pointer paints only the latest sample once per scheduled frame", () => {
  const clock = frames(), painted = [];
  const { createFramePointer } = compile("../src/components/ui/framePointer.ts");
  const pointer = createFramePointer(point => painted.push(point), clock.request, clock.cancel);
  for (let point = 0; point < 100; point++) pointer.push(point);
  assert.equal(clock.pending, 1);
  assert.deepEqual(painted, []);
  clock.tick();
  assert.deepEqual(painted, [99]);
  assert.equal(clock.pending, 0);
  pointer.push(100); clock.tick();
  assert.deepEqual(painted, [99, 100]);
});

test("frame pointer flush preserves the final release sample and cancel discards pending work", () => {
  const clock = frames(), painted = [];
  const { createFramePointer } = compile("../src/components/ui/framePointer.ts");
  const pointer = createFramePointer(point => painted.push(point), clock.request, clock.cancel);
  pointer.push("move"); pointer.push("release"); pointer.flush();
  assert.deepEqual(painted, ["release"]);
  assert.equal(clock.pending, 0);
  clock.tick(); pointer.flush();
  assert.deepEqual(painted, ["release"]);
  pointer.push("stale"); pointer.cancel(); clock.tick();
  assert.deepEqual(painted, ["release"]);
  assert.equal(clock.pending, 0);
});

function switchHarness({ checked = false, scale = 1, reduced = false, disabled = false } = {}) {
  const clock = frames(), refs = [], effects = [], changes = [], attributes = new Map(), styles = new Map();
  let cursor = 0, focused = false, capture = null;
  const element = {
    clientWidth: 54,
    closest: () => ({}),
    focus() { focused = true; },
    setPointerCapture(id) { capture = id; },
    hasPointerCapture(id) { return capture === id; },
    releasePointerCapture(id) { if (capture === id) capture = null; },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    style: { setProperty(name, value) { styles.set(name, value); } },
  };
  const imports = {
    react: {
      forwardRef: fn => fn,
      useRef: initial => refs[cursor++] ??= { current: initial },
      useEffect: setup => { if (!effects.length) effects.push(setup()); },
    },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    glisse: { Glass: "glass" },
    "framer-motion": { useReducedMotion: () => false },
    "../window-manager/useSystemStore": { useSystemStore: select => select({ reduceMotion: reduced }) },
    "../window-manager/desktopCoordinates": { getDesktopCoordinateSpace: () => ({
      toLocal: point => ({ x: point.x / scale, y: point.y / scale }),
    }) },
    "./PortfolioGlass.module.css": { default: { switch: "switch" } },
  };
  const globals = { requestAnimationFrame: clock.request, cancelAnimationFrame: clock.cancel };
  imports["./framePointer"] = compile("../src/components/ui/framePointer.ts", {}, globals);
  const { GlassSwitch } = compile("../src/components/ui/PortfolioGlass.tsx", imports, globals, true);
  let output;
  const render = () => {
    cursor = 0;
    output = GlassSwitch({ checked, disabled, "aria-label": "Test switch", onCheckedChange: value => changes.push(value) });
    return output;
  };
  render();
  const event = (extra = {}) => ({ currentTarget: element, pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 20, ...extra });
  return { clock, changes, attributes, styles, event, element,
    get output() { return output; }, get focused() { return focused; }, get capture() { return capture; },
    call(name, extra) { output.props[name](event(extra)); },
    rerender(values) { if (values.checked !== undefined) checked = values.checked; if (values.reduced !== undefined) reduced = values.reduced; return render(); },
    cleanup() { effects.forEach(cleanup => cleanup?.()); },
  };
}

test("switch pointer tap changes state exactly once and retains keyboard activation", () => {
  const h = switchHarness();
  h.call("onPointerDown");
  assert.equal(h.focused, true);
  h.call("onPointerUp"); h.call("onClick", { detail: 1 });
  assert.deepEqual(h.changes, [true]);
  assert.equal(h.capture, null);
  h.rerender({ checked: true });
  h.call("onClick", { detail: 0 });
  assert.deepEqual(h.changes, [true, false], "Enter/Space synthesized click remains one action");
});

test("switch drag uses projected desktop coordinates and commits the final release point", () => {
  const h = switchHarness({ scale: .4 });
  h.call("onPointerDown");
  h.call("onPointerMove", { clientX: 102 });
  h.call("onPointerMove", { clientX: 104 });
  assert.equal(h.clock.pending, 1);
  h.clock.tick();
  assert.equal(h.attributes.get("data-switch-dragging"), "true");
  assert.ok(Math.abs(Number(h.styles.get("--switch-position")) - 10 / 28) < 1e-8);
  h.call("onPointerUp", { clientX: 112 });
  h.call("onClick", { detail: 1 });
  assert.deepEqual(h.changes, [true], "release is flushed even without another animation frame");
  assert.equal(h.clock.pending, 0);
  assert.equal(h.attributes.has("data-switch-dragging"), false);
});

test("switch cancellation restores the prior value without committing or retaining queued work", () => {
  const h = switchHarness({ checked: true });
  h.call("onPointerDown");
  h.call("onPointerMove", { clientX: 60 });
  h.call("onPointerCancel"); h.clock.tick();
  assert.deepEqual(h.changes, []);
  assert.equal(h.styles.get("--switch-position"), "1");
  assert.equal(h.attributes.has("data-switch-dragging"), false);
  assert.equal(h.clock.pending, 0);
  assert.equal(h.capture, null);
});

test("switch ignores unrelated pointer samples and disabled pointer starts", () => {
  const h = switchHarness();
  h.call("onPointerDown");
  h.call("onPointerMove", { pointerId: 2, clientX: 160 });
  h.call("onPointerUp", { pointerId: 2 });
  assert.equal(h.clock.pending, 0);
  assert.deepEqual(h.changes, []);
  h.call("onPointerCancel");
  const disabled = switchHarness({ disabled: true });
  disabled.call("onPointerDown");
  assert.equal(disabled.capture, null);
  assert.equal(disabled.focused, false);
});

test("reduced motion retains the same semantic switch and unmount cancels a pending drag frame", () => {
  const h = switchHarness();
  assert.equal(h.output.type, "button");
  assert.equal(h.output.props.role, "switch");
  assert.equal(h.output.props["aria-label"], "Test switch");
  h.call("onPointerDown");
  h.rerender({ reduced: true });
  assert.equal(h.output.type, "button");
  assert.equal(h.output.props["data-reduced-motion"], true);
  assert.equal(h.focused, true);
  h.call("onPointerMove", { clientX: 150 });
  assert.equal(h.clock.pending, 1);
  h.cleanup(); h.clock.tick();
  assert.equal(h.clock.pending, 0);
  assert.deepEqual(h.changes, []);
});
