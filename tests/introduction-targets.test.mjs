import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function harness() {
  const nodes = new Map(), listeners = new Map(), timers = new Map(); let id = 0;
  const window = { innerWidth: 1000, innerHeight: 700,
    setInterval: callback => { timers.set(++id, callback); return id; }, clearInterval: id => timers.delete(id),
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const document = { querySelector: selector => nodes.get(selector) ?? null, getElementById: () => nodes.get("desktop") ?? null };
  const output = ts.transpileModule(readFileSync(new URL("../src/components/portfolio/introductionTargets.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = { exports: {} }; runInNewContext(`(function(module,exports,require){${output}\n})(module,module.exports,require)`, { module: loaded, window, document,
    require: specifier => specifier === "../window-manager/desktopCoordinates" ? { getDesktopCoordinateSpace: () => null } : (() => { throw Error(`Unexpected import ${specifier}`); }) });
  const node = (left, top, width, height, hidden = false) => ({ closest: () => hidden ? {} : null,
    getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }) });
  return { ...loaded.exports, nodes, window, listeners, timers, node };
}
test("target rectangles use actual client geometry, clamp to the page and hide during zoom/minimize", () => {
  const h = harness(); const selector = '#desktop-root [data-file-icon="projects"]';
  h.nodes.set("desktop", {}); h.nodes.set(selector, h.node(880, 20, 200, 90));
  let result = h.measureIntroductionTarget("projects"); assert.equal(result.desktopReady, true);
  assert.deepEqual([...Object.values(result.target)], [880, 20, 116, 90]);
  h.window.innerWidth = 500; assert.equal(h.measureIntroductionTarget("projects").target, null);
  h.nodes.set(selector, h.node(-100, -50, 200, 90)); result = h.measureIntroductionTarget("projects");
  assert.deepEqual([...Object.values(result.target)], [4, 4, 96, 36]);
  h.nodes.set('[data-screen-surface][data-transitioning]', {}); result = h.measureIntroductionTarget("projects"); assert.equal(result.desktopReady, false); assert.equal(result.target, null);
  h.nodes.delete('[data-screen-surface][data-transitioning]'); h.nodes.set(selector, h.node(20, 20, 100, 100, true)); assert.equal(h.measureIntroductionTarget("projects").target, null);
  h.nodes.set('[data-screen-surface]', { dataset: { screenView: "laptop" } }); assert.equal(h.measureIntroductionTarget("terminal", true).desktopReady, false);
  h.nodes.set('[data-screen-surface]', { dataset: { screenView: "focused" } }); assert.equal(h.measureIntroductionTarget("terminal", true).desktopReady, true);
});
test("the active Projects folder takes precedence over the desktop icon; closed/missing targets stay safe", () => {
  const h = harness(); h.nodes.set("desktop", {}); h.nodes.set('#desktop-root [data-file-icon="projects"]', h.node(850, 20, 100, 100));
  h.nodes.set('[data-window-active="true"] [data-finder-content="projects"]', h.node(200, 130, 400, 300));
  assert.equal(h.measureIntroductionTarget("projects").target.x, 200);
  assert.equal(h.measureIntroductionTarget("terminal").target, null); assert.equal(h.measureIntroductionTarget("terminal").desktopReady, true);
  h.nodes.delete("desktop"); assert.equal(h.measureIntroductionTarget("terminal").desktopReady, false);
});
test("the outer Settings gear stays in viewport coordinates and the final card never becomes a pointer target", () => {
  const h = harness(); h.nodes.set("desktop", {});
  h.nodes.set('[data-workspace-trigger]', h.node(18, 634, 48, 48));
  h.nodes.set('[data-screen-surface]', { dataset: { screenView: "laptop" } });
  h.nodes.set('[data-introduction-finish]', h.node(640, 200, 260, 100));
  assert.deepEqual(Object.values(h.measureIntroductionTarget("laptop", false).target), [18, 634, 48, 48]);
  assert.equal(h.measureIntroductionTarget("finish").target, null);
  assert.equal(h.measureIntroductionTarget("screen", true).desktopReady, false);
});
test("the cursor points at the portion of a target that is visible beside the fixed guide", () => {
  const h = harness(); h.nodes.set("desktop", {});
  h.nodes.set('[data-introduction-viewport] [data-introduction-panel]', h.node(450, 40, 380, 380));
  h.nodes.set('[data-terminal-introduction]', h.node(300, 180, 400, 200));
  assert.deepEqual(Object.values(h.measureIntroductionTarget("terminal").target), [300, 180, 150, 200]);
  h.nodes.set('[data-terminal-introduction]', h.node(460, 180, 120, 100));
  assert.equal(h.measureIntroductionTarget("terminal").target, null);
});
test("Terminal points only to the visible transcript and stops when covered by another app", () => {
  const h = harness(); h.nodes.set("desktop", {});
  const frame = { dataset: { windowActive: "true" } };
  const transcript = h.node(200, 200, 400, 220);
  const intro = y => ({ ...h.node(220, y, 360, 110), closest: selector =>
    selector === "[data-window-frame]" ? frame : selector === "[data-terminal-transcript]" ? transcript : null });
  h.nodes.set('[data-dock-app="terminal"]', h.node(350, 620, 32, 32));
  h.nodes.set('[data-terminal-introduction]', intro(130));
  assert.deepEqual(Object.values(h.measureIntroductionTarget("terminal").target), [220, 200, 360, 40]);
  h.nodes.set('[data-terminal-introduction]', intro(80));
  assert.equal(h.measureIntroductionTarget("terminal").target, null);
  h.nodes.set('[data-terminal-introduction]', intro(210));
  frame.dataset.windowActive = "false";
  const background = h.measureIntroductionTarget("terminal");
  assert.equal(background.desktopReady, true);
  assert.equal(background.target, null);
  frame.dataset.windowActive = "true";
  assert.deepEqual(Object.values(h.measureIntroductionTarget("terminal").target), [220, 210, 360, 110]);
});
test("the contact guide follows profiles only within the active Browser tab and its scrollport", () => {
  const h = harness();
  h.nodes.set("desktop", {});
  h.nodes.set('[data-dock-app="safari"]', h.node(400, 620, 32, 32));
  assert.deepEqual(Object.values(h.measureIntroductionTarget("contact").target), [400, 620, 32, 32]);

  let profiles = h.node(220, 170, 360, 70);
  const page = { ...h.node(200, 200, 400, 220), querySelector: () => profiles };
  const frame = { dataset: { windowActive: "true" }, querySelector: selector => selector === "[data-safari-page]:not([hidden])" ? page : null };
  h.nodes.set('[data-window-frame="app-safari"]', frame);
  let result = h.measureIntroductionTarget("contact");
  assert.deepEqual(Object.values(result.target), [220, 200, 360, 40]);
  assert.deepEqual(Object.values(result.viewport), [200, 200, 400, 220]);

  profiles = h.node(220, 120, 360, 70);
  assert.equal(h.measureIntroductionTarget("contact").target, null);
  profiles = h.node(220, 220, 360, 70);
  frame.dataset.windowActive = "false";
  assert.equal(h.measureIntroductionTarget("contact").target, null);
  frame.dataset.windowActive = "true";
  assert.deepEqual(Object.values(h.measureIntroductionTarget("contact").target), [220, 220, 360, 70]);
  profiles = null;
  assert.equal(h.measureIntroductionTarget("contact").target, null);
});
test("active target observation follows moved/resized targets and cancels its timer/listener and late callbacks", () => {
  const h = harness(), values = [];
  const stop = h.observeIntroductionTarget("terminal", value => values.push(value));
  assert.equal(values.length, 1); assert.equal(h.timers.size, 1); assert.equal(h.listeners.size, 2);
  h.nodes.set("desktop", {}); h.nodes.set('[data-terminal-introduction]', h.node(200, 100, 400, 220));
  const queued = [...h.timers.values()][0]; queued(); assert.equal(values.at(-1).target.x, 200);
  h.nodes.set('[data-terminal-introduction]', h.node(300, 200, 400, 220)); h.listeners.get("resize")(); assert.equal(values.at(-1).target.x, 300);
  stop(); stop(); queued(); assert.equal(values.length, 3); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});
