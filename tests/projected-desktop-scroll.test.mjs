import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const filename = new URL("../src/components/desktop/projectedDesktopScroll.ts", import.meta.url);
const loaded = { exports: {} };
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
runInThisContext(`(function(module,exports){${compiled}\n})`, { filename: filename.pathname })(loaded, loaded.exports);
const { bindProjectedDesktopScroll, wheelPixels } = loaded.exports;

function fixture({ projected = true, rounded = false } = {}) {
  class Element {
    constructor(parentElement = null, style = {}, size = {}) {
      this.parentElement = parentElement;
      this.style = { overflowX: "visible", overflowY: "visible", direction: "ltr", lineHeight: "20px", ...style };
      Object.assign(this, { clientWidth: 200, clientHeight: 100, scrollWidth: 200, scrollHeight: 100 }, size);
      this.top = 0;
      this.left = 0;
      this.writes = 0;
      this.isConnected = true;
      this.dataset = {};
    }
    get scrollTop() { return this.top; }
    set scrollTop(value) { this.writes++; this.top = Math.max(0, Math.min(this.scrollHeight - this.clientHeight, rounded ? Math.round(value) : value)); }
    get scrollLeft() { return this.left; }
    set scrollLeft(value) {
      const size = this.scrollWidth - this.clientWidth;
      this.left = this.style.direction === "rtl" ? Math.min(0, Math.max(-size, value)) : Math.max(0, Math.min(size, value));
    }
    contains(node) { for (; node; node = node.parentElement) if (node === this) return true; return false; }
    closest() { return projected ? this : null; }
  }
  const listeners = new Map();
  const frames = new Map();
  let nextFrame = 0;
  const root = new Element(null, {}, { clientWidth: 1400, clientHeight: 900 });
  let hit;
  const doc = {
    defaultView: {
      Element, HTMLElement: Element, getComputedStyle: element => element.style,
      requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
      cancelAnimationFrame(id) { frames.delete(id); },
    },
    elementFromPoint: () => hit,
    addEventListener(type, handler, options) { assert.deepEqual(options, { capture: true, passive: false }); listeners.set(type, handler); },
    removeEventListener(type, handler, capture) { assert.equal(capture, true); assert.equal(listeners.get(type), handler); listeners.delete(type); },
  };
  root.ownerDocument = doc;
  const wrapper = new Element(root, { overflowY: "hidden" }, { scrollHeight: 4000 });
  const pane = new Element(wrapper, { overflowY: "auto" }, { scrollHeight: 600 });
  const child = new Element(pane);
  hit = child;
  const cleanup = bindProjectedDesktopScroll(root);
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(); };
  const wheel = (values = {}, autoFlush = true) => {
    const event = {
      deltaX: 0, deltaY: 30, deltaMode: 0, cancelable: true, defaultPrevented: false,
      composedPath: () => [child, pane, wrapper, root],
      preventDefault() { this.defaultPrevented = true; },
      ...values,
    };
    listeners.get("wheel")?.(event);
    if (autoFlush) flush();
    return event;
  };
  return { root, wrapper, pane, child, Element, listeners, frames, cleanup, wheel, flush, setHit: value => { hit = value; } };
}

test("pixel, line and page wheel units preserve fractional values and device direction", () => {
  assert.equal(wheelPixels(-0.125, 0, 20, 400), -0.125);
  assert.equal(wheelPixels(3, 1, 20, 400), 60);
  assert.equal(wheelPixels(-1, 2, 20, 400), -400);
  assert.equal(wheelPixels(NaN, 0, 20, 400), 0);
});

test("one event scrolls only the actual app region, never the projection wrapper", () => {
  const f = fixture();
  assert.equal(f.root.dataset.scrollRouting, "projected");
  assert.equal(f.wheel().defaultPrevented, true);
  assert.equal(f.pane.scrollTop, 30);
  assert.equal(f.wrapper.scrollTop, 0);
  f.wheel({ deltaY: -12.5 });
  assert.equal(f.pane.scrollTop, 17.5);
});

test("small rounded trackpad deltas accumulate and reverse without a smoothing tail", () => {
  const f = fixture({ rounded: true });
  for (let i = 0; i < 20; i++) f.wheel({ deltaY: 0.1 });
  assert.equal(f.pane.scrollTop, 2);
  for (let i = 0; i < 20; i++) f.wheel({ deltaY: -0.1 });
  assert.equal(f.pane.scrollTop, 0);
  f.wheel({ deltaY: 30 });
  assert.equal(f.pane.scrollTop, 30);
});

test("keyboard/history scroll changes invalidate fractional carry", () => {
  const f = fixture({ rounded: true });
  f.wheel({ deltaY: 0.4 });
  f.pane.scrollTop = 100;
  f.wheel({ deltaY: 0.2 });
  assert.equal(f.pane.scrollTop, 100);
});

test("nested regions pass only unconsumed distance to an actual ancestor scroller", () => {
  const f = fixture();
  const inner = new f.Element(f.pane, { overflowY: "auto" }, { scrollHeight: 200 });
  f.setHit(inner);
  f.wheel({ deltaY: 130 });
  assert.equal(inner.scrollTop, 100);
  assert.equal(f.pane.scrollTop, 30);
  f.wheel({ deltaY: -150 });
  assert.equal(inner.scrollTop, 0);
  assert.equal(f.pane.scrollTop, 0);
});

test("overscroll containment stops chaining at a nested app region", () => {
  const f = fixture();
  const inner = new f.Element(f.pane, { overflowY: "auto", overscrollBehaviorY: "contain" }, { scrollHeight: 200 });
  f.setHit(inner);
  f.wheel({ deltaY: 200 });
  assert.equal(inner.scrollTop, 100);
  assert.equal(f.pane.scrollTop, 0);
});

test("bounds consume excess momentum without retaining it for the next direction", () => {
  const f = fixture();
  f.wheel({ deltaY: 10000 });
  f.wheel({ deltaY: 500 });
  assert.equal(f.pane.scrollTop, 500);
  f.wheel({ deltaY: -1 });
  assert.equal(f.pane.scrollTop, 499);
  f.wheel({ deltaY: -10000 });
  f.wheel({ deltaY: 1 });
  assert.equal(f.pane.scrollTop, 1);
});

test("current pointer hit takes priority over a stale wheel-transaction target", () => {
  const f = fixture();
  const second = new f.Element(f.wrapper, { overflowY: "auto" }, { scrollHeight: 300 });
  f.setHit(second);
  f.wheel();
  assert.equal(second.scrollTop, 30);
  assert.equal(f.pane.scrollTop, 0);
});

test("pinch, modified, canceled and uncancelable events remain untouched", () => {
  const f = fixture();
  for (const values of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { defaultPrevented: true }, { cancelable: false }]) {
    const event = f.wheel(values);
    assert.equal(event.defaultPrevented, !!values.defaultPrevented);
    assert.equal(f.pane.scrollTop, 0);
  }
});

test("horizontal and diagonal wheel input uses the matching axes without remapping", () => {
  const f = fixture();
  f.pane.style.overflowX = "auto";
  f.pane.scrollWidth = 500;
  f.wheel({ deltaX: 12.5, deltaY: 7 });
  assert.equal(f.pane.scrollLeft, 12.5);
  assert.equal(f.pane.scrollTop, 7);
  f.pane.style.direction = "rtl";
  f.pane.scrollLeft = 0;
  f.wheel({ deltaX: -20, deltaY: 0 });
  assert.equal(f.pane.scrollLeft, -20);
});

test("line/page input uses the region's dimensions and line height", () => {
  const f = fixture();
  f.wheel({ deltaY: 2, deltaMode: 1 });
  assert.equal(f.pane.scrollTop, 40);
  f.wheel({ deltaY: 1, deltaMode: 2 });
  assert.equal(f.pane.scrollTop, 140);
});

test("outside the desktop and non-overflowing content do not acquire wheel ownership", () => {
  const f = fixture();
  f.setHit(new f.Element());
  assert.equal(f.wheel().defaultPrevented, false, "a stale transaction target must not scroll behind workspace controls");
  f.setHit(f.child);
  f.pane.scrollHeight = f.pane.clientHeight;
  assert.equal(f.wheel().defaultPrevented, false);
});

test("flat desktop uses native scrolling and disposal removes the sole listener", () => {
  const flat = fixture({ projected: false });
  assert.equal(flat.listeners.size, 0);
  flat.cleanup();
  const f = fixture();
  assert.equal(f.listeners.size, 1);
  f.cleanup();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.root.dataset.scrollRouting, undefined);
});

test("a high-frequency burst is applied once per frame with no lost input", () => {
  const f = fixture({ rounded: true });
  for (let i = 0; i < 100; i++) f.wheel({ deltaY: 0.2 }, false);
  assert.equal(f.pane.scrollTop, 0);
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.pane.scrollTop, 20);
  assert.equal(f.pane.writes, 1);
  assert.equal(f.frames.size, 0, "no perpetual animation/inertia loop");
});

test("reversals cancel pending distance immediately and chain using unpainted positions", () => {
  const f = fixture();
  f.wheel({ deltaY: 80 }, false);
  f.wheel({ deltaY: -50 }, false);
  f.flush();
  assert.equal(f.pane.scrollTop, 30);
  const inner = new f.Element(f.pane, { overflowY: "auto" }, { scrollHeight: 200 });
  f.setHit(inner);
  f.wheel({ deltaY: 70 }, false);
  f.wheel({ deltaY: 70 }, false);
  f.flush();
  assert.equal(inner.scrollTop, 100);
  assert.equal(f.pane.scrollTop, 70);
});

test("native movement between input and painting is not overwritten by a stale base", () => {
  const f = fixture();
  f.wheel({ deltaY: 30 }, false);
  f.pane.scrollTop = 100;
  f.flush();
  assert.equal(f.pane.scrollTop, 130);
});

test("closing/unmounting cancels pending painting and detached panes are not retained", () => {
  const f = fixture();
  f.wheel({}, false);
  f.cleanup();
  assert.equal(f.frames.size, 0);
  f.flush();
  assert.equal(f.pane.scrollTop, 0);
  const g = fixture();
  g.wheel({}, false);
  g.pane.isConnected = false;
  g.flush();
  assert.equal(g.pane.scrollTop, 0);
  assert.equal(g.frames.size, 0);
});
