import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// Controlled component/effect execution. No browser layout or hardware claim.
function harness() {
  const nodes = [], effects = [], refs = [], slots = [], events = new Map(), timers = new Map(), observations = [];
  let refCursor = 0, effectCursor = 0, stateCursor = 0, pending = [], phase = "pending", step = "screen", storageAvailable = true, view = false, active = true, available = true, serial = 0;
  let owner = null, output;
  class Element {
    isConnected = true; internal = false; constructor(name) { this.name = name; }
    focus() { document.activeElement = this; }
    getClientRects() { return [{}]; }
    closest() { return this.internal || this.closedDetails ? {} : null; }
  }
  const summary = new Element("overview"), document = { activeElement: new Element("body"), querySelector: () => summary };
  const window = {
    addEventListener: (name, fn) => { events.set(name, fn); }, removeEventListener: name => events.delete(name),
    setInterval: fn => { timers.set(++serial, fn); return serial; }, clearInterval: id => timers.delete(id),
  };
  const actions = [], opened = [];
  const state = { hydrate() { if (phase === "pending") phase = "welcome"; },
    skip() { if (phase === "welcome" || phase === "active") { phase = "dismissed"; actions.push("skip"); } },
    start() { if (phase === "welcome") { phase = "active"; step = "laptop"; } },
    next(expected) { if (phase === "active" && step === expected) { const steps = ["laptop", "screen", "projects", "terminal", "contact", "finish"]; step = steps[steps.indexOf(step) + 1] ?? "finish"; } },
    back() {}, finish(view) { actions.push(view); phase = "dismissed"; } };
  const getState = () => ({ ...state, phase, step, storageAvailable });
  const useIntroductionStore = selector => selector(getState()); useIntroductionStore.getState = getState;
  const useDisplayStore = selector => selector({ interfaceScale: 1, screenView: view });
  const useWindowStore = selector => selector({ windows: {}, focusedWindowId: null });
  useWindowStore.getState = () => ({ openWindow: config => opened.push(config) });
  const effect = (setup, deps, layout = false) => {
    const index = effectCursor++;
    if (!effects[index] || deps.some((value, i) => !Object.is(value, effects[index].deps[i]))) pending.push({ index, setup, deps, layout });
  };
  const react = { useEffect: (fn, deps) => effect(fn, deps), useLayoutEffect: (fn, deps) => effect(fn, deps, true),
    useRef: initial => { const i = refCursor++; return refs[i] ??= { current: initial }; },
    useState: initial => { const i = stateCursor++; slots[i] ??= typeof initial === "function" ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; } };
  const jsx = (type, props) => { const node = { type, props: props ?? {} }; nodes.push(node); return node; };
  const imports = {
    "../ui/PortfolioGlass": { GlassButton: "button" },
    react, "react-dom": { createPortal: node => node }, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "../../data/portfolioProfile": { PORTFOLIO_PROFILE: { name: "Om Sawkare", role: "Computer vision, AI workflows, and backend development.", purpose: "An interactive portfolio." } },
    "../../data/projectsData": { PROJECTS: [{ featured: true, id: "veyra", key: "veyra", name: "Veyra" }, { featured: true, id: "adobe", key: "adobe", name: "Adobe" }] },
    "../window-manager/useWindowStore": { useWindowStore },
    "../desktop/useSafariStore": { SAFARI_START_URL: "portfolio://start", useSafariStore: { getState: () => ({ navigate() {} }) } },
    "../window-manager/useSystemStore": { useSystemStore: selector => selector({ reduceMotion: false }) },
    "../window-manager/useDisplayStore": { useDisplayStore, getWorkspaceControlsOffset: () => 100 }, "./portfolioActions": { runPortfolioAction: value => actions.push(value) },
    "../desktop/desktopIconLayout": { DESKTOP_ICON_W: 84 },
    "./useIntroductionStore": { useIntroductionStore, INTRODUCTION_STEPS: ["laptop", "screen", "projects", "terminal", "contact", "finish"] },
    "./introductionCursor": {
      cursorPointFromTarget: target => target ? { x: target.x + target.width / 2, y: target.y + target.height / 2 } : null,
      cursorTransform: point => `translate3d(${point.x}px, ${point.y}px, 0)`,
      cursorTravelDuration: (previous, next, stepChanged, reduceMotion) => reduceMotion || !previous ? 0 : stepChanged ? 700 : 120,
    },
    "./introductionTargets": { observeIntroductionTarget: (_step, notify) => {
      const measure = () => notify({ desktopReady: available, target: null }); measure(); observations.push(measure);
      const timer = window.setInterval(measure); return () => window.clearInterval(timer);
    } },
  };
  const loaded = { exports: {} };
  const outputJS = ts.transpileModule(readFileSync(new URL("../src/components/portfolio/PortfolioIntroduction.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(`(function(module,exports,require){${outputJS}\n})(module,module.exports,require)`, { module: loaded, require: name => name.endsWith(".css") ? { default: {} } : imports[name], document, window, HTMLElement: Element });
  const text = node => typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : "";
  function render(component = loaded.exports.PortfolioIntroduction, props = { active, available, onOverview: () => actions.push("overview") }) {
    if (owner && owner !== component) { effects.forEach(effect => effect?.cleanup?.()); effects.length = refs.length = slots.length = 0; }
    owner = component; refCursor = effectCursor = stateCursor = 0; pending = []; nodes.length = 0;
    output = component(props);
    for (const node of nodes) if (node.props.ref) { const el = new Element(node.type); el.internal = true; node.props.ref.current = el; }
    for (const { index, setup, deps } of pending.sort((a, b) => Number(b.layout) - Number(a.layout))) { effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: setup() }; }
    return output;
  }
  return { Element, document, events, timers, actions, opened, observations, text,
    render, get nodes() { return nodes; }, get output() { return output; },
    click(label) { const button = nodes.find(node => node.type === "button" && text(node) === label); assert.ok(button, label); if (!button.props.disabled) button.props.onClick(); },
    set(values) { if (values.phase !== undefined) phase = values.phase; if (values.step !== undefined) step = values.step; if (values.active !== undefined) active = values.active; if (values.available !== undefined) available = values.available; if (values.storageAvailable !== undefined) storageAvailable = values.storageAvailable; },
    child() { return nodes.find(node => node.type?.name === "GuideStep"); },
    cleanup() { effects.forEach(effect => effect?.cleanup?.()); }, get phase() { return phase; }, get owner() { return owner; },
  };
}

test("welcome preserves ordinary focus, identifies Om immediately and offers semantic optional actions", () => {
  const h = harness(); h.render(); h.render();
  assert.equal(h.document.activeElement.name, "body"); assert.match(h.text(h.output), /Om Sawkare/); assert.match(h.text(h.output), /computer vision/i);
  for (const label of ["Take a tour", "Dismiss", "Explore projects"]) assert.ok(h.nodes.some(node => node.type === "button" && h.text(node) === label));
  assert.equal(h.events.size, 1); h.click("Dismiss"); h.render(); assert.equal(h.output, null); assert.equal(h.events.size, 0); assert.equal(h.document.activeElement.name, "overview"); h.cleanup();
});
test("replay focuses the guide and returns focus; Escape is scoped to the panel", () => {
  const h = harness(); h.set({ phase: "dismissed" }); h.render(); const trigger = new h.Element("replay settings button"); h.document.activeElement = trigger;
  h.set({ phase: "welcome" }); h.render(); assert.equal(h.document.activeElement.name, "h2");
  h.click("Take a tour"); h.render(); assert.equal(h.document.activeElement.name, "h2");
  const panel = h.nodes.find(node => node.props["data-introduction-panel"]); let stopped = false;
  panel.props.onKeyDown({ key: "Escape", preventDefault() {}, stopPropagation() { stopped = true; } }); h.render();
  assert.equal(stopped, true); assert.equal(h.document.activeElement, trigger); assert.equal(h.events.size, 0); h.cleanup();
});
test("interrupted route and pagehide dismiss immediately and remove listeners without media actions", () => {
  for (const interrupt of ["route", "pagehide"]) {
    const h = harness(); h.set({ phase: "active", step: "projects" }); h.render();
    if (interrupt === "route") { h.set({ active: false }); h.render(); } else h.events.get("pagehide")();
    h.render(); assert.equal(h.phase, "dismissed"); assert.equal(h.output, null); assert.equal(h.events.size, 0); assert.deepEqual(h.opened, []); h.cleanup();
  }
});
test("a closed overview trigger with a nonempty client rectangle cannot strand focus after replay", () => {
  const h = harness(); h.set({ phase: "dismissed" }); h.render();
  const trigger = new h.Element("hidden replay button"); trigger.closedDetails = true;
  h.document.activeElement = trigger; h.set({ phase: "welcome" }); h.render(); h.click("Take a tour"); h.render();
  h.set({ phase: "dismissed" }); h.render(); assert.equal(h.document.activeElement.name, "overview"); assert.equal(h.events.size, 0); h.cleanup();
});
test("missing Terminal has a retry and does not reopen in a loop; readiness gates advance and cleanup stops observation", () => {
  const h = harness(); h.set({ phase: "active", step: "terminal", available: false }); h.render(); const child = h.child(); h.cleanup();
  h.render(child.type, child.props);
  assert.ok(h.nodes.some(node => node.type === "button" && h.text(node) === "Open Terminal"));
  h.click("Open Terminal"); assert.equal(h.opened.length, 1);
  h.render(child.type, child.props); h.render(child.type, child.props); assert.equal(h.opened.length, 1);
  h.click("Next"); assert.equal(h.phase, "active");
  assert.equal(h.opened[0].id, "app-terminal"); assert.equal(h.timers.size, 1); h.cleanup(); assert.equal(h.timers.size, 0);
});

test("ScreenSurface cancels an interrupted preview immediately and restores normal zoom/reduced-motion behavior", () => {
  const effects = [], refs = [], animations = []; let refCursor = 0, effectCursor = 0, pending = [], view = false, instant = false;
  const wrapper = { classList: { toggle() {} } };
  const element = { dataset: {}, clientWidth: 1000, clientHeight: 700, closest: () => wrapper,
    animate: () => { const motion = { cancel() { this.cancelled = true; this.oncancel?.(); } }; animations.push(motion); return motion; } };
  const effect = (setup, deps) => { const i = effectCursor++; if (!effects[i] || deps.some((value, j) => !Object.is(value, effects[i].deps[j]))) pending.push({ i, setup, deps }); };
  const react = { useRef: initial => refs[refCursor++] ??= { current: initial }, useEffect: effect, useLayoutEffect: effect };
  const jsx = (_type, props) => { if (props.ref) props.ref.current = element; return props; };
  const imports = { react, "react/jsx-runtime": { jsx },
    "../window-manager/useDisplayStore": { useDisplayStore: selector => selector({ screenView: view, instantViewChange: instant }) },
    "../window-manager/desktopCoordinates": { getDesktopCoordinateSpace: () => ({ toClient: p => p, toLocal: p => p }) },
    "./screenViewGeometry": { screenQuadMatrix: () => "matrix3d(fixture)" },
  };
  const loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL("../src/components/webcam/ScreenSurface.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(`(function(module,exports,require){${source}\n})(module,module.exports,require)`, {
    module: loaded, require: name => name.endsWith(".css") ? { default: {} } : imports[name], window: { addEventListener() {}, removeEventListener() {} } });
  const render = (reduced = false) => {
    refCursor = effectCursor = 0; pending = []; loaded.exports.ScreenSurface({ children: null, reduceMotion: reduced });
    for (const { i, setup, deps } of pending) { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: setup() }; }
  };
  render(); view = true; render(); assert.equal(animations.length, 1); assert.equal(element.dataset.transitioning, "true");
  view = false; instant = true; render(); assert.equal(animations.length, 1); assert.equal(animations[0].cancelled, true); assert.equal(element.dataset.transitioning, undefined);
  view = true; instant = false; render(); assert.equal(animations.length, 2);
  view = false; render(true); assert.equal(animations.length, 2); assert.equal(element.dataset.transitioning, undefined);
  effects.forEach(effect => effect.cleanup?.());
});
