import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function compile(path, imports = {}, globals = {}) {
  const loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const localRequire = name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name.endsWith(".png")) return { src: "/fixture.png", width: 56, height: 56 };
    if (name.endsWith(".module.css")) return new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) });
    if (!name.startsWith(".")) return require(name);
    throw Error(`Unexpected dependency: ${name}`);
  };
  runInNewContext(`(function(module,exports,require){${source}\n})(module,module.exports,require)`, { module: loaded, require: localRequire, ...globals });
  return loaded.exports;
}

test("Dock exposes one named native button per app, minimized window and Bin without nested controls", () => {
  const actions = [], controls = new Map();
  const state = { windows: { note: { id: "note", title: "Notes", kind: "notes", minimized: true }, files: { id: "files", title: "Desktop", kind: "finder", minimized: false } }, focusedWindowId: "files",
    focusWindow: id => actions.push(["restore", id]), openWindow: value => { actions.push(["open", value.id]); state.focusedWindowId = value.id; } };
  const useWindowStore = selector => selector(state); useWindowStore.getState = () => state;
  const appIdentity = compile("data/appIdentity.ts");
  const portfolioApps = compile("data/portfolioApps.ts", { "./appIdentity": appIdentity });
  const launcher = compile("components/desktop/visitorLaunchers.ts", {
    "../../data/projectsData": {},
    "../../data/fileSystem": { PORTFOLIO_DOCUMENTS: new Map() },
    "../../data/portfolioApps": portfolioApps,
    "../window-manager/useWindowStore": { useWindowStore },
  });
  const system = { theme: "dark", trashItems: [], dropTarget: null, dockMagnification: true, dockSize: .75, reduceMotion: false };
  const Button = props => {
    const native = Object.fromEntries(Object.entries(props).filter(([key]) => !["whileHover", "transition", "animate"].includes(key)));
    controls.set(native["data-dock-app"] ?? native["data-dock-minimized-window"], props);
    assert.equal(native.onKeyDown, undefined, "Enter/Space use native activation, not a competing keyboard handler");
    return React.createElement("button", native);
  };
  const { default: Dock } = compile("components/dock/Dock.tsx", {
    "framer-motion": { motion: { button: Button }, useReducedMotion: () => false },
    "next/image": props => React.createElement("img", { ...props, src: props.src.src }),
    "../window-manager/useWindowStore": { useWindowStore },
    "../window-manager/useSystemStore": { useSystemStore: selector => selector(system) },
    "../window-manager/windowFocus": { focusPortfolioWindow: id => actions.push(["focus", id]), revealDockControl() {} },
    "../../data/appIdentity": appIdentity,
    "../../data/portfolioApps": portfolioApps,
    "../../data/portfolioAppArtwork": compile("data/portfolioAppArtwork.ts"),
    "../desktop/visitorLaunchers": launcher,
  });
  const html = renderToStaticMarkup(React.createElement(Dock));
  assert.equal((html.match(/<button /g) ?? []).length, 10);
  assert.equal((html.match(/type="button"/g) ?? []).length, 10);
  for (const name of ["Files", "Terminal", "Notes", "Mail", "Browser", "Music", "Camera", "Settings", "Bin"]) assert.ok(html.includes(`aria-label="Open ${name}"`));
  assert.match(html, /aria-label="Restore Notes window"/);
  assert.match(html, /data-dock-app="finder"[^>]*aria-current="true"|aria-current="true"[^>]*data-dock-app="finder"/);
  for (const inner of html.split(/<button [^>]*>/).slice(1)) assert.doesNotMatch(inner.split("</button>")[0], /<(button|a|input)\b/);
  controls.get("notes").onClick();
  assert.deepEqual(actions, [["open", "app-notes"], ["focus", "app-notes"]]);
  actions.length = 0;
  controls.get("note").onClick();
  assert.deepEqual(actions, [["restore", "note"], ["focus", "note"]]);
  actions.length = 0;
  controls.get("bin").onClick();
  assert.deepEqual(actions, [["open", "bin-window"], ["focus", "bin-window"]]);
  assert.ok(html.includes('width="44"'), "small Dock preference retains a 44px local target");
});

test("queued focus ignores stale/closed windows and reveals only the narrow Dock scroller", () => {
  const queue = [], focused = [];
  const dock = { scrollLeft: 0, clientWidth: 200 };
  const button = { dataset: { dockMinimizedWindow: "notes" }, offsetLeft: 500, offsetWidth: 56, closest: () => dock, focus: options => focused.push(["dock", options]) };
  const frame = { dataset: { windowFrame: "notes", windowActive: "true", windowMinimized: "false" }, contains: () => false, focus: options => focused.push(["frame", options]) };
  const { focusPortfolioWindow, focusMinimizedWindowControl, revealDockControl } = compile("components/window-manager/windowFocus.ts", {}, {
    requestAnimationFrame: callback => queue.push(callback), document: { activeElement: {}, querySelectorAll: selector => selector === "[data-window-frame]" ? [frame] : [button] },
  });
  focusPortfolioWindow("notes"); frame.dataset.windowActive = "false"; queue.shift()(); assert.equal(focused.length, 0);
  frame.dataset.windowActive = "true"; frame.dataset.windowMinimized = "true";
  focusPortfolioWindow("notes"); queue.shift()(); assert.equal(focused.length, 0);
  frame.dataset.windowMinimized = "false"; focusPortfolioWindow("notes"); queue.shift()(); assert.equal(focused[0][0], "frame");
  focusMinimizedWindowControl("notes"); queue.shift()(); assert.equal(focused[1][0], "dock"); assert.equal(dock.scrollLeft, 362);
  revealDockControl({ ...button, offsetLeft: 20 }); assert.equal(dock.scrollLeft, 14);
});

test("menu focus scrolls long menus rather than moving the desktop projection", () => {
  const menu = { scrollTop: 0, clientHeight: 160 };
  const calls = [];
  const { focusMenuItem } = compile("components/desktop/menuFocus.ts");
  focusMenuItem(null);
  focusMenuItem({ offsetTop: 400, offsetHeight: 64, closest: () => menu, focus: options => calls.push(options) });
  assert.equal(menu.scrollTop, 304);
  focusMenuItem({ offsetTop: 8, offsetHeight: 64, closest: () => menu, focus: options => calls.push(options) });
  assert.equal(menu.scrollTop, 8);
  assert.ok(calls.every(call => call.preventScroll === true));
  const items = { offsetTop: 6, scrollTop: 0, clientHeight: 76, scrollHeight: 192 };
  menu.scrollTop = 0;
  focusMenuItem({ parentElement: items, offsetTop: 166, offsetHeight: 32, closest: () => menu, focus: options => calls.push(options) });
  assert.equal(items.scrollTop, 116);
  assert.equal(menu.scrollTop, 0, "the glass backing must not scroll with the item list");
});
