import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const filename = fileURLToPath(new URL("../src/components/window-manager/useWindowStore.ts", import.meta.url));
const modules = new Map();
function loadTypeScript(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const loadedModule = { exports: {} };
  modules.set(filename, loadedModule);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const localRequire = specifier => specifier.startsWith(".") ? loadTypeScript(resolve(dirname(filename), `${specifier}.ts`)) : require(specifier);
  runInThisContext(`(function(module, exports, require) { ${compiled}\n})`, { filename })(loadedModule, loadedModule.exports, localRequire);
  return loadedModule.exports;
}
const store = loadTypeScript(filename).useWindowStore;
const state = () => store.getState();
const open = (id, kind = "notes") => state().openWindow({ id, kind, title: id });

beforeEach(() => store.setState(store.getInitialState(), true));

test("closing is synchronous and repeated close requests have one owner", () => {
  open("notes");
  assert.equal(state().beginCloseWindow("notes"), true);
  assert.equal(state().windows.notes.closing, true);
  for (let index = 0; index < 100; index++) assert.equal(state().beginCloseWindow("notes"), false);
  state().closeWindow("notes");
  assert.equal(state().windows.notes, undefined);
  assert.equal(state().beginCloseWindow("notes"), false);
});

test("rapid close/minimize/maximize/focus/launch combinations cannot revive an exiting window", () => {
  open("first");
  open("second");
  state().beginCloseWindow("second");
  const original = state().windows.second;
  for (let index = 0; index < 100; index++) {
    state().toggleMinimize("second");
    state().toggleMaximize("second");
    state().focusWindow("second");
    open("second");
  }
  assert.equal(state().windows.second, original);
  assert.equal(state().focusedWindowId, "first");
  state().closeWindow("second");
  open("second");
  assert.equal(state().windows.second.closing, false, "launch works normally once the prior exit finishes");
  assert.equal(state().focusedWindowId, "second");
});

test("closing single-instance Music cannot spawn a second player via a different launcher ID", () => {
  open("app-music", "music");
  state().beginCloseWindow("app-music");
  open("menu-music", "music");
  assert.deepEqual(Object.keys(state().windows), ["app-music"]);
  state().closeWindow("app-music");
  open("menu-music", "music");
  assert.deepEqual(Object.keys(state().windows), ["menu-music"]);
});

test("an old exit completion cannot close a replacement with the same window ID", () => {
  open("notes");
  state().beginCloseWindow("notes");
  const oldRequest = state().windows.notes.closeRequestId;
  state().closeWindow("notes");
  open("notes");
  state().completeCloseWindow("notes", oldRequest);
  assert.equal(state().windows.notes.closing, false);
  state().beginCloseWindow("notes");
  const newRequest = state().windows.notes.closeRequestId;
  assert.notEqual(newRequest, oldRequest);
  state().completeCloseWindow("notes", oldRequest);
  assert.equal(state().windows.notes.closing, true);
  state().completeCloseWindow("notes", newRequest);
  assert.equal(state().windows.notes, undefined);
});

test("focus is a no-op for the already focused window, avoiding a rerender for every button press", () => {
  open("notes");
  const original = state();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  for (let index = 0; index < 100; index++) state().focusWindow("notes");
  unsubscribe();
  assert.equal(state(), original);
  assert.equal(notifications, 0);
});

test("minimize/restore/maximize combinations retain normal geometry and a valid focus", () => {
  open("first");
  open("second");
  const originalPosition = state().windows.second.position;
  const originalSize = state().windows.second.size;
  for (let index = 0; index < 100; index++) {
    state().toggleMaximize("second");
    state().toggleMinimize("second");
    assert.equal(state().focusedWindowId, "first");
    const maximized = state().windows.second.maximized;
    state().toggleMaximize("second");
    assert.equal(state().windows.second.maximized, maximized, "hidden windows cannot receive a competing maximize action");
    open("second");
    assert.equal(state().windows.second.minimized, false);
    assert.equal(state().focusedWindowId, "second");
    assert.equal(state().windows.second.position, originalPosition);
    assert.equal(state().windows.second.size, originalSize);
  }
});

test("closing focus excludes other closing/minimized windows and bring-all cannot resurrect them", () => {
  open("visible");
  open("hidden");
  state().toggleMinimize("hidden");
  open("exiting");
  state().beginCloseWindow("exiting");
  assert.equal(state().focusedWindowId, "visible");
  state().bringAllToFront();
  assert.notEqual(state().focusedWindowId, "exiting");
  assert.equal(state().windows.exiting.closing, true);
  state().beginCloseWindow("visible");
  state().closeWindow("visible");
  assert.equal(state().focusedWindowId, "hidden");
  state().beginCloseWindow("hidden");
  assert.equal(state().focusedWindowId, null);
});

test("events arriving after removal cannot create a ghost window or publish redundant updates", () => {
  open("notes");
  state().closeWindow("notes");
  const original = state();
  state().closeWindow("notes");
  state().toggleMaximize("notes");
  state().toggleMinimize("notes");
  state().setWindowPosition("notes", { x: 99, y: 99 });
  state().focusWindow("notes");
  assert.equal(state(), original);
  assert.deepEqual(state().windows, {});
});

test("restoring a minimized window publishes active, visible and frontmost together", () => {
  open("first"); open("second");
  state().toggleMinimize("first");
  const snapshots = [];
  const unsubscribe = store.subscribe(current => snapshots.push(current));
  state().toggleMinimize("first");
  unsubscribe();
  assert.equal(snapshots.length, 1);
  assert.equal(state().focusedWindowId, "first");
  assert.equal(state().windows.first.minimized, false);
  assert.ok(state().windows.first.zIndex > state().windows.second.zIndex);
});

test("launching a minimized single-instance app restores and raises its actual ID atomically", () => {
  open("app-settings", "settings"); open("notes");
  state().toggleMinimize("app-settings");
  const snapshots = [];
  const unsubscribe = store.subscribe(current => snapshots.push(current));
  open("menu-settings", "settings");
  unsubscribe();
  assert.equal(snapshots.length, 1);
  assert.equal(state().windows["menu-settings"], undefined);
  assert.equal(state().focusedWindowId, "app-settings");
  assert.equal(state().windows["app-settings"].minimized, false);
  assert.ok(state().windows["app-settings"].zIndex > state().windows.notes.zIndex);
});

test("stack ranks stay compact through repeated focus, restore, close and bring-all actions", () => {
  open("a"); open("b"); open("c");
  for (let index = 0; index < 1000; index++) {
    const id = ["a", "b", "c"][index % 3];
    state().focusWindow(id);
    state().toggleMinimize(id); state().toggleMinimize(id);
    if (index % 17 === 0) state().bringAllToFront();
    const ordered = Object.values(state().windows).sort((a, b) => a.zIndex - b.zIndex);
    assert.deepEqual(ordered.map(w => w.zIndex), [10, 11, 12]);
    assert.equal(ordered.at(-1).id, state().focusedWindowId);
    assert.equal(state().nextZIndex, 13);
  }
  state().closeWindow("b");
  assert.deepEqual(Object.values(state().windows).map(w => w.zIndex).sort(), [10, 11]);
  assert.equal(state().nextZIndex, 12);
});

test("maximize captures the exact outer rectangle and restores it after repeated cycles", () => {
  state().openWindow({ id: "notes", kind: "notes", title: "Notes", position: { x: 123, y: 87 }, size: { width: 731, height: 453 } });
  const normal = state().windows.notes;
  for (let index = 0; index < 30; index++) {
    state().toggleMaximize("notes");
    assert.deepEqual(state().windows.notes.restoreRect, { x: 123, y: 87, width: 733, height: 491 });
    state().setWindowPosition("notes", { x: 999, y: 999 });
    assert.equal(state().windows.notes.position, normal.position);
    state().toggleMaximize("notes");
    assert.equal(state().windows.notes.position, normal.position);
    assert.equal(state().windows.notes.size, normal.size);
    assert.equal(state().windows.notes.restoreRect, undefined);
  }
});

test("desktop resize fits restored windows but leaves a maximized snapshot intact until restore", () => {
  open("notes");
  state().setWindowPosition("notes", { x: 700, y: 300 });
  state().toggleMaximize("notes");
  const saved = state().windows.notes.restoreRect;
  state().setDesktopWorkArea({ x: 0, y: 28, width: 500, height: 350 });
  assert.equal(state().windows.notes.restoreRect, saved);
  state().toggleMaximize("notes");
  assert.deepEqual(state().windows.notes.position, { x: 0, y: 28 });
  assert.deepEqual(state().windows.notes.size, { width: 498, height: 312 });
  state().setDesktopWorkArea({ x: 0, y: 28, width: 350, height: 250 });
  assert.deepEqual(state().windows.notes.size, { width: 348, height: 212 });
  const previous = state();
  state().setDesktopWorkArea({ x: 0, y: 28, width: 350, height: 250 });
  assert.equal(state(), previous, "unchanged layout causes no redundant update");
});

test("position updates clamp every edge in desktop units without changing window size", () => {
  open("notes");
  const size = state().windows.notes.size;
  state().setWindowPosition("notes", { x: -1000, y: -1000 });
  assert.deepEqual(state().windows.notes.position, { x: 0, y: 28 });
  state().setWindowPosition("notes", { x: 10000, y: 10000 });
  assert.deepEqual(state().windows.notes.position, { x: 758, y: 422 });
  assert.equal(state().windows.notes.size, size);
});

test("normal windows move behind the dock to the actual screen edge and restore there", () => {
  open("notes");
  state().setWindowPosition("notes", { x: 20, y: 10000 });
  assert.deepEqual(state().windows.notes.position, { x: 20, y: 422 });
  assert.equal(state().windows.notes.position.y + state().windows.notes.size.height + 38, 900);
  assert.equal(state().desktopWorkArea.y + state().desktopWorkArea.height, 810, "maximize still reserves the dock");
  state().toggleMaximize("notes");
  state().toggleMaximize("notes");
  assert.deepEqual(state().windows.notes.position, { x: 20, y: 422 }, "restore must not reapply the dock wall");
});

test("changing dock size affects maximize but does not push a normal window away from the screen edge", () => {
  open("notes");
  state().setWindowPosition("notes", { x: 50, y: 422 });
  const normal = state().windows.notes;
  const bounds = { x: 0, y: 28, width: 1400, height: 872 };
  state().setDesktopWorkArea({ x: 0, y: 28, width: 1400, height: 754 }, bounds);
  assert.equal(state().windows.notes, normal);
  state().setDesktopWorkArea({ x: 0, y: 28, width: 1400, height: 790 }, bounds);
  assert.equal(state().windows.notes, normal);
  assert.deepEqual(state().desktopBounds, bounds);
});
