import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const filename = fileURLToPath(new URL("../src/components/desktop/DesktopIcon.tsx", import.meta.url));
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

// Exercise the actual component's event handlers. Native browser event ordering,
// transformed hit testing and pointer capture are covered by Stage 9 browser QA.
function harness({ rename = null } = {}) {
  const refs = [], effects = [], subscribers = new Set();
  let cursor = 0, view, opened = 0;
  let system = { isDragging: false, reduceMotion: false, draggedItem: null, dragPointerId: null };
  const interactions = { selections: {}, rename, selectItem(surface, id) { interactions.selections[surface] = id; } };
  const jsx = (type, props) => ({ type, props });
  const useSystemStore = selector => selector(system);
  useSystemStore.subscribe = callback => { subscribers.add(callback); return () => subscribers.delete(callback); };
  const useFileInteractionStore = selector => selector(interactions);
  useFileInteractionStore.getState = () => interactions;
  const dependencies = {
    react: { useRef(value) { const index = cursor++; return refs[index] ??= { current: value }; }, useEffect(setup) { effects.push(setup()); } },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/image": { __esModule: true, default: "img" },
    "framer-motion": { motion: { button: "button" }, useReducedMotion: () => false },
    "./DesktopIcon.module.css": { __esModule: true, default: {} },
    "../window-manager/useSystemStore": { useSystemStore },
    "./useFileInteractionStore": { useFileInteractionStore },
    "./FolderRenameInput": { FolderRenameInput: "rename-input" },
    "../../assets/FolderIcon.png": { __esModule: true, default: {} },
  };
  const loadedModule = { exports: {} };
  runInNewContext(`(function(module, exports, require) { ${compiled}\n})(module, module.exports, require)`, {
    module: loadedModule, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; },
  }, { filename });
  const render = () => {
    for (const cleanup of effects.splice(0)) cleanup?.();
    cursor = 0;
    view = loadedModule.exports.DesktopIcon({ label: "Projects", variant: "folder", itemId: "projects", surfaceId: "desktop", onSelect() { interactions.selectItem("desktop", "projects"); }, onOpen() { opened++; } });
  };
  render();
  return {
    render,
    get button() { return view.props.children[0].props; },
    get opened() { return opened; },
    get selected() { return interactions.selections.desktop; },
    drag(id = "projects", pointerId = 7) {
      const previous = system;
      system = { ...system, isDragging: true, draggedItem: { id }, dragPointerId: pointerId };
      for (const callback of subscribers) callback(system, previous);
    },
    endDrag() { system = { ...system, isDragging: false, draggedItem: null, dragPointerId: null }; render(); },
    cleanup() { for (const cleanup of effects.splice(0)) cleanup?.(); },
  };
}
function event(values = {}) {
  return { key: "", repeat: false, detail: 1, button: 0, pointerId: 7, nativeEvent: {}, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...values };
}
function click(h, detail = 1) {
  h.button.onPointerDown(event());
  h.button.onPointerUp(event());
  const e = event({ detail });
  h.button.onClick(e);
  return e;
}

test("Enter and Space activate once and suppress native repeat/keyup clicks, including selectable icons", () => {
  for (const key of ["Enter", " "]) {
    const h = harness();
    const first = event({ key });
    h.button.onKeyDown(first);
    const repeat = event({ key, repeat: true });
    h.button.onKeyDown(repeat);
    const up = event({ key });
    h.button.onKeyUp(up);
    assert.equal(h.opened, 1);
    assert.equal(h.selected, "projects");
    for (const e of [first, repeat, up]) { assert.equal(e.prevented, true); assert.equal(e.stopped, true); }
    h.cleanup();
  }
});

test("focus selects an icon visibly, while single click selects and double click opens exactly once", () => {
  const h = harness();
  h.button.onFocus();
  h.render();
  assert.equal(h.button["data-selected"], true);
  assert.equal(h.button["aria-pressed"], true);
  click(h, 1);
  assert.equal(h.opened, 0);
  click(h, 2);
  h.button.onDoubleClick(event({ detail: 2 }));
  assert.equal(h.opened, 1);
  h.cleanup();
});

test("assistive activation remains available after a completed pointer drag", () => {
  const h = harness();
  h.button.onPointerDown(event());
  h.drag();
  h.endDrag();
  h.button.onClick(event({ detail: 0 }));
  assert.equal(h.opened, 1);
  h.cleanup();
});

test("a completed shared drag cannot become a click/double click after pointerup cleared drag state", () => {
  const h = harness();
  h.button.onPointerDown(event());
  h.drag();
  h.endDrag();
  const dropped = event({ detail: 1 });
  h.button.onClick(dropped);
  h.button.onDoubleClick(event({ detail: 2 }));
  assert.equal(dropped.prevented, true);
  assert.equal(h.opened, 0);
  // Some browsers continue the click count after a drag. Only one accepted
  // click has occurred, so this must still not count as a double activation.
  click(h, 2);
  h.button.onDoubleClick(event({ detail: 2 }));
  assert.equal(h.opened, 0);
  click(h, 1);
  click(h, 2);
  h.button.onDoubleClick(event({ detail: 2 }));
  assert.equal(h.opened, 1);
  h.cleanup();
});

test("dragging a different icon does not suppress the current icon's activation", () => {
  const h = harness();
  h.button.onPointerDown(event());
  h.drag("another-folder");
  h.endDrag();
  h.button.onClick(event({ detail: 1 }));
  click(h, 2);
  h.button.onDoubleClick(event({ detail: 2 }));
  assert.equal(h.opened, 1);
  h.cleanup();
});

test("rename editors and composition do not activate folders; F2 and Shift+F10 still reach the surface", () => {
  const h = harness({ rename: { surfaceId: "desktop", itemId: "projects", token: 1 } });
  for (const key of ["Enter", " "]) h.button.onKeyDown(event({ key }));
  h.button.onClick(event({ detail: 0 }));
  h.button.onDoubleClick(event({ detail: 2 }));
  assert.equal(h.opened, 0);
  for (const key of ["F2", "F10", "ContextMenu"]) {
    const e = event({ key, shiftKey: key === "F10" });
    h.button.onKeyDown(e);
    assert.equal(e.prevented, false);
    assert.equal(e.stopped, false);
  }
  h.cleanup();
  const active = harness();
  active.button.onKeyDown(event({ key: "Enter", nativeEvent: { isComposing: true } }));
  assert.equal(active.opened, 0);
  active.cleanup();
});

test("assistive button activation opens once and pointer cancellation cannot activate", () => {
  const h = harness();
  h.button.onClick(event({ detail: 0 }));
  assert.equal(h.opened, 1);
  h.button.onPointerDown(event());
  h.button.onPointerCancel(event());
  const cancelled = event();
  h.button.onClick(cancelled);
  assert.equal(cancelled.prevented, true);
  assert.equal(h.opened, 1);
  h.cleanup();
});
