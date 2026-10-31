import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { beforeEach, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";

// Exercise the actual Zustand store and its real imports without adding a test
// framework or changing the application's extensionless bundler imports.
const require = createRequire(import.meta.url);
const modules = new Map();
function loadTypeScript(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const localRequire = (specifier) => specifier.startsWith(".")
    ? loadTypeScript(resolve(dirname(filename), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`))
    : require(specifier);
  runInThisContext(`(function(module, exports, require) { ${output}\n})`, { filename })(loaded, loaded.exports, localRequire);
  return loaded.exports;
}

const root = fileURLToPath(new URL("../", import.meta.url));
const { useSystemStore: store } = loadTypeScript(resolve(root, "src/components/window-manager/useSystemStore.ts"));
const { useWindowStore: windowStore } = loadTypeScript(resolve(root, "src/components/window-manager/useWindowStore.ts"));
const state = () => store.getState();
const item = (id) => state().getFileItem(id);
const create = (parentId, name) => {
  const id = state().createFolder(parentId, name);
  assert.ok(id, `could not create ${name ?? "default folder"} in ${parentId ?? "desktop"}`);
  return id;
};
const snapshot = () => JSON.stringify({
  fileSystem: state().fileSystem, desktopIds: state().desktopIds,
  desktopPositions: state().desktopPositions, trashItems: state().trashItems,
  trashOrigins: state().trashOrigins, past: state().past, future: state().future,
});

beforeEach(() => {
  store.setState(store.getInitialState(), true);
  windowStore.setState(windowStore.getInitialState(), true);
});

describe("folder identity and names", () => {
  test("rapid creation uses unique stable IDs and destination-local automatic numbering", () => {
    const originalNow = Date.now;
    Date.now = () => 42;
    try {
      const ids = Array.from({ length: 40 }, () => create());
      assert.equal(new Set(ids).size, 40);
      assert.deepEqual(ids.slice(0, 3).map((id) => item(id).name), ["Untitled Folder", "Untitled Folder 2", "Untitled Folder 3"]);
      assert.equal(item(create(ids[0])).name, "Untitled Folder", "a new destination has its own numbering");
      assert.equal(state().desktopIds.filter((id) => ids.includes(id)).length, 40);
      assert.equal(state().fileSystem.desktop.filter((file) => ids.includes(file.id)).length, 40);
      const positions = ids.map((id) => state().desktopPositions[id]);
      assert.equal(new Set(positions.map(({ x, y }) => `${x}:${y}`)).size, 40, "rapid creation wraps into distinct visible columns");
      for (const { x, y } of positions) {
        assert.ok(x >= 0 && x + 84 <= 1400, `x=${x} must stay inside desktop`);
        assert.ok(y >= 32 && y + 88 <= 900 - 96, `y=${y} must stay above the Dock`);
      }
    } finally { Date.now = originalNow; }
  });

  test("new desktop folders avoid manual and trashed positions without moving existing icons", () => {
    const first = create();
    const saved = { ...state().desktopPositions[first] };
    state().addToTrash(first);
    const next = create();
    assert.notDeepEqual(state().desktopPositions[next], saved, "a trashed folder keeps its slot for restoration");
    assert.deepEqual(state().desktopPositions[first], saved);
    state().moveToDesktop(next, { x: 1196, y: 48 });
    const manual = { ...state().desktopPositions[next] };
    const before = { ...state().desktopPositions };
    for (let index = 0; index < 20; index++) create();
    for (const [id, position] of Object.entries(before)) assert.deepEqual(state().desktopPositions[id], position);
    assert.deepEqual(state().desktopPositions[next], manual);
    const all = Object.entries(state().desktopPositions);
    for (const [id, { x, y }] of all) {
      for (const [otherId, other] of all) {
        if (id === otherId) continue;
        assert.ok(x >= other.x + 84 || x + 84 <= other.x || y >= other.y + 88 || y + 88 <= other.y, `${id} overlaps ${otherId}`);
      }
    }
    state().restoreFromTrash(first);
    assert.deepEqual(state().desktopPositions[first], saved);
  });

  test("a full desktop still creates a folder at a reachable bounded position", () => {
    const occupied = {};
    for (let x = 1300; x >= 0; x -= 104) {
      for (let y = 48; y <= 716; y += 88) occupied[`occupied-${x}-${y}`] = { x, y };
    }
    store.setState({ desktopPositions: occupied });
    const id = create();
    const { x, y } = state().desktopPositions[id];
    assert.ok(x >= 0 && x + 84 <= 1400);
    assert.ok(y >= 32 && y + 88 <= 900 - 96);
    for (const [savedId, position] of Object.entries(occupied)) assert.deepEqual(state().desktopPositions[savedId], position);
  });

  test("create normalizes explicit names and rejects blanks, invalid names and duplicate siblings without history", () => {
    const id = create("desktop", "  Cafe\u0301  ");
    assert.equal(item(id).name, "Café");
    const before = snapshot();
    for (const name of ["", " \t\n ", ".", "..", "bad/name", "bad\\name", "bad\u0000name", "bad\nname", "x".repeat(256), "cafe\u0301"]) {
      assert.equal(state().createFolder("desktop", name), null, JSON.stringify(name));
      assert.equal(snapshot(), before, "invalid creation is not an undoable action");
    }
    assert.equal(item(create(id, "Café")).name, "Café", "names may repeat in different folders");
  });

  test("renaming changes only folder metadata and preserves nested IDs and associations", () => {
    const parent = create("desktop", "Parent");
    const child = create(parent, "Child");
    const grandchild = create(child, "Grandchild");
    const keys = Object.keys(state().fileSystem);
    assert.deepEqual(state().renameFolder(parent, "  New Parent  "), { ok: true, name: "New Parent" });
    assert.equal(item(parent).id, parent);
    assert.equal(item(parent).name, "New Parent");
    assert.deepEqual(Object.keys(state().fileSystem), keys);
    assert.equal(state().fileSystem[parent][0].id, child);
    assert.equal(state().fileSystem[child][0].id, grandchild);
    assert.equal(state().createFolder("new-parent"), null, "display titles are never folder IDs");
    assert.equal(item(create(parent)).name, "Untitled Folder");
  });

  test("rename rejects invalid, duplicate and non-folder targets without changing history", () => {
    const first = create("desktop", "First");
    create("desktop", "Second");
    const before = snapshot();
    for (const [id, name] of [[first, " "], [first, "."], [first, ".."], [first, "foo/bar"], [first, "second"], ["bin", "Trash"], ["missing", "Name"], ["Neural Block", "App"]]) {
      const result = state().renameFolder(id, name);
      assert.equal(result.ok, false, `${id}: ${name}`);
      assert.equal(typeof result.error, "string");
      assert.equal(snapshot(), before);
    }
    assert.deepEqual(state().renameFolder(first, "First"), { ok: true, name: "First" });
    assert.equal(snapshot(), before, "committing the same name is a no-op");
    assert.deepEqual(state().renameFolder(first, "FIRST"), { ok: true, name: "FIRST" });
    assert.equal(state().past.at(-1).label, "RENAME_FOLDER");
  });

  test("default names fill the first available number and ignore names currently in Bin", () => {
    const first = create();
    const second = create();
    create();
    state().addToTrash(second);
    const replacement = create();
    assert.equal(item(replacement).name, "Untitled Folder 2");
    state().renameFolder(first, "Custom");
    assert.equal(item(create()).name, "Untitled Folder");
  });

  test("create and rename undo/redo preserve identity and a new action clears redo", () => {
    const id = create("desktop", "Original");
    state().renameFolder(id, "Renamed");
    state().undo();
    assert.equal(item(id).name, "Original");
    assert.equal(state().future.at(-1).label, "RENAME_FOLDER");
    state().redo();
    assert.equal(item(id).name, "Renamed");
    assert.equal(item(id).id, id);
    state().undo();
    state().undo();
    assert.equal(item(id), null);
    assert.equal(state().fileSystem[id], undefined);
    state().redo();
    assert.equal(item(id).name, "Original");
    state().redo();
    assert.equal(item(id).name, "Renamed");
    state().undo();
    state().renameFolder(id, "Another name");
    assert.equal(state().future.length, 0);
    state().redo();
    assert.equal(item(id).name, "Another name");
  });
});

describe("trash subtree ownership and restoration", () => {
  test("restoring the initial Projects folder restores its three real project files without restoring unrelated trash", () => {
    const projectIds = state().fileSystem.projects.map((file) => file.id);
    assert.equal(projectIds.length, 3, "exercise the original audit's actual Projects dataset");
    assert.deepEqual(state().fileSystem["about-me"], [], "the intentional empty folder remains empty");
    state().addToTrash("about-me");
    state().addToTrash("projects");
    for (const id of ["projects", ...projectIds]) assert.equal(state().isHidden(id), true);
    state().restoreFromTrash("projects");
    for (const id of ["projects", ...projectIds]) assert.equal(state().isHidden(id), false, id);
    assert.deepEqual(state().fileSystem.projects.map((file) => file.id), projectIds);
    assert.deepEqual(state().trashItems, ["about-me"]);
    assert.deepEqual(state().fileSystem["about-me"], []);
    const restored = snapshot();
    state().restoreFromTrash("projects");
    assert.equal(snapshot(), restored, "a repeated restore changes neither membership nor history");
  });

  test("create → rename → nest → rename parent → move → trash → restore retains every identity and child", () => {
    const parent = create();
    state().renameFolder(parent, "Portfolio work");
    const child = create(parent);
    const deep = create(child, "Research");
    state().renameFolder(parent, "Current work");
    state().moveToFolder(parent, "documents");
    assert.equal(state().desktopIds.includes(parent), false);
    assert.equal(state().fileSystem.documents.some((file) => file.id === parent), true);
    state().addToTrash(parent);
    assert.deepEqual(new Set(state().trashItems), new Set([parent, child, deep]));
    state().restoreFromTrash(parent);
    for (const id of [parent, child, deep]) assert.equal(state().isHidden(id), false, id);
    assert.equal(item(parent).name, "Current work");
    assert.equal(state().fileSystem[parent][0].id, child);
    assert.equal(state().fileSystem[child][0].id, deep);
    assert.equal(state().fileSystem.documents.filter((file) => file.id === parent).length, 1);
    assert.deepEqual(state().trashOrigins, {});
    const restored = snapshot();
    state().restoreFromTrash(parent);
    assert.equal(snapshot(), restored, "a repeated restore cannot create entries or history");
  });

  test("parent restore leaves independently trashed descendants and unrelated items in Bin", () => {
    const parent = create("desktop", "Parent");
    const independent = create(parent, "Earlier trash");
    const independentDeep = create(independent, "Earlier deep");
    const child = create(parent, "Normal child");
    const deep = create(child, "Normal deep");
    const unrelated = create("desktop", "Unrelated");
    state().addToTrash(independent);
    state().addToTrash(unrelated);
    state().addToTrash(parent);
    assert.equal(state().canRestoreFromTrash(parent), true);
    assert.equal(state().canRestoreFromTrash(independent), false);
    assert.equal(state().canRestoreFromTrash(child), false);
    assert.equal(state().trashOrigins[independent], independent);
    assert.equal(state().trashOrigins[independentDeep], independent);
    assert.equal(state().trashOrigins[child], parent);
    const hidden = snapshot();
    state().restoreFromTrash(child);
    state().restoreFromTrash(independent);
    assert.equal(snapshot(), hidden, "cannot restore a descendant into a hidden parent");
    state().restoreFromTrash(parent);
    assert.equal(state().canRestoreFromTrash(independent), true);
    for (const id of [parent, child, deep]) assert.equal(state().isHidden(id), false);
    for (const id of [independent, independentDeep, unrelated]) assert.equal(state().isHidden(id), true);
    assert.deepEqual(new Set(state().trashItems), new Set([independent, independentDeep, unrelated]));
    state().restoreFromTrash(independent);
    assert.equal(state().isHidden(independentDeep), false);
    assert.deepEqual(state().trashItems, [unrelated]);
  });

  test("restore conflict chooses an available sibling name without changing IDs or children", () => {
    const old = create("desktop", "Notes");
    const child = create(old, "Child");
    state().addToTrash(old);
    const replacement = create("desktop", "notes");
    state().restoreFromTrash(old);
    assert.equal(item(old).name, "Notes 2");
    assert.equal(item(replacement).name, "notes");
    assert.equal(state().fileSystem[old][0].id, child);
    assert.equal(state().isHidden(child), false);
  });

  test("undo/redo trash and restore also restores ownership metadata for future actions", () => {
    const parent = create("desktop", "Parent");
    const child = create(parent, "Child");
    state().addToTrash(parent);
    const origins = { ...state().trashOrigins };
    state().undo();
    assert.deepEqual(state().trashItems, []);
    assert.deepEqual(state().trashOrigins, {});
    state().redo();
    assert.deepEqual(state().trashOrigins, origins);
    state().restoreFromTrash(parent);
    state().undo();
    assert.equal(state().isHidden(child), true);
    assert.deepEqual(state().trashOrigins, origins);
    state().redo();
    assert.equal(state().isHidden(child), false);
    assert.deepEqual(state().trashOrigins, {});
    state().addToTrash(parent);
    state().restoreFromTrash(parent);
    assert.equal(state().isHidden(child), false);
  });

  test("Bin and hidden/deleted destinations reject create, rename and moves without adding history", () => {
    const parent = create("desktop", "Parent");
    const child = create(parent, "Child");
    const source = create("desktop", "Source");
    state().addToTrash(parent);
    const before = snapshot();
    for (const destination of ["bin", parent, child, "missing", "__proto__", "Neural Block"]) {
      assert.equal(state().createFolder(destination), null);
      state().moveToFolder(source, destination);
      assert.equal(snapshot(), before);
    }
    assert.equal(state().renameFolder(parent, "Hidden").ok, false);
    assert.equal(state().renameFolder(child, "Hidden child").ok, false);
    state().moveToDesktop(child);
    state().moveToFolder(child, "documents");
    assert.equal(snapshot(), before);
    state().emptyTrash();
    assert.deepEqual(state().trashOrigins, {});
    assert.equal(state().createFolder(parent), null);
    assert.equal(state().renameFolder(parent, "Deleted").ok, false);
    state().restoreFromTrash(parent);
    state().undo();
    assert.equal(state().isHidden(parent), true, "permanently deleted IDs stay deleted after undo");
    assert.equal(state().isHidden(child), true);
  });

  test("moving a folder cannot create cycles or duplicate visible names", () => {
    const parent = create("desktop", "Parent");
    const child = create(parent, "Child");
    const destination = create("desktop", "Destination");
    create(destination, "PARENT");
    const before = snapshot();
    state().moveToFolder(parent, child);
    state().moveToFolder(parent, parent);
    state().moveToFolder(parent, destination);
    state().moveToFolder("bin", parent);
    assert.equal(snapshot(), before);
    state().moveToFolder(child, "documents");
    create("desktop", "CHILD");
    const collision = snapshot();
    state().moveToDesktop(child);
    assert.equal(snapshot(), collision);
  });
});

describe("Finder window identities and navigation", () => {
  const windowState = () => windowStore.getState();
  const openFinder = (id, folderId, title) => windowState().openWindow({ id, kind: "finder", folderId, title });
  const finder = (id = "finder-test") => windowState().windows[id];

  test("opening a Finder uses its opaque folder ID rather than its display title", () => {
    const folderId = create("desktop", "Work, sketches & ideas");
    openFinder("finder-test", folderId, item(folderId).name);
    assert.notEqual(folderId, "work,-sketches-&-ideas");
    assert.equal(finder().folderId, folderId);
    assert.equal(finder().title, "Work, sketches & ideas");
    assert.deepEqual(finder().folderHistory, [folderId]);
    assert.equal(finder().folderHistoryIndex, 0);
    assert.equal(item(create(finder().folderId)).name, "Untitled Folder");
  });

  test("navigation, back and forward retain IDs and a new branch truncates only forward history", () => {
    const first = create("desktop", "First");
    const second = create(first, "Second");
    const third = create(second, "Third");
    const branch = create(first, "Branch");
    openFinder("finder-test", first, item(first).name);
    windowState().setFinderLocation("finder-test", second, item(second).name);
    windowState().setFinderLocation("finder-test", third, item(third).name);
    assert.deepEqual(finder().folderHistory, [first, second, third]);
    assert.equal(finder().folderHistoryIndex, 2);
    windowState().setFinderLocation("finder-test", second, item(second).name, 1);
    assert.equal(finder().folderId, second);
    assert.equal(finder().folderHistoryIndex, 1);
    assert.deepEqual(finder().folderHistory, [first, second, third]);
    windowState().setFinderLocation("finder-test", third, item(third).name, 2);
    assert.equal(finder().folderId, third);
    windowState().setFinderLocation("finder-test", first, item(first).name, 0);
    windowState().setFinderLocation("finder-test", branch, item(branch).name);
    assert.deepEqual(finder().folderHistory, [first, branch]);
    assert.equal(finder().folderHistoryIndex, 1);
    const before = finder();
    windowState().setFinderLocation("finder-test", third, item(third).name, 2);
    assert.equal(finder(), before, "an invalid history index cannot jump to a truncated entry");
  });

  test("a renamed location updates its title without appending or rewriting history IDs", () => {
    const parent = create("desktop", "Parent");
    const child = create(parent, "Child");
    openFinder("finder-test", parent, item(parent).name);
    windowState().setFinderLocation("finder-test", child, item(child).name);
    const history = finder().folderHistory;
    state().renameFolder(child, "Renamed child");
    windowState().setFinderLocation("finder-test", child, item(child).name);
    assert.equal(finder().title, "Renamed child");
    assert.equal(finder().folderId, child);
    assert.equal(finder().folderHistory, history);
    assert.deepEqual(finder().folderHistory, [parent, child]);
    assert.equal(finder().folderHistoryIndex, 1);
    state().renameFolder(parent, "Renamed parent");
    windowState().setFinderLocation("finder-test", parent, item(parent).name, 0);
    assert.equal(finder().title, "Renamed parent");
    assert.deepEqual(finder().folderHistory, [parent, child]);
    windowState().setFinderLocation("finder-test", child, item(child).name, 1);
    assert.equal(finder().title, "Renamed child");
    assert.equal(finder().folderId, child);
  });

  test("two Finder windows can show the same real folder with independent navigation", () => {
    const shared = create("desktop", "Shared work");
    const nested = create(shared, "Nested");
    openFinder("finder-one", shared, item(shared).name);
    openFinder("finder-two", shared, item(shared).name);
    assert.equal(Object.keys(windowState().windows).length, 2);
    assert.equal(finder("finder-one").folderId, shared);
    assert.equal(finder("finder-two").folderId, shared);
    windowState().setFinderLocation("finder-one", nested, item(nested).name);
    assert.equal(finder("finder-two").folderId, shared);
    assert.deepEqual(finder("finder-two").folderHistory, [shared]);
    state().renameFolder(shared, "Shared renamed");
    windowState().setFinderLocation("finder-two", shared, item(shared).name);
    assert.equal(finder("finder-two").title, "Shared renamed");
    assert.equal(finder("finder-one").folderId, nested);
    assert.equal(state().fileSystem[shared][0].id, nested);
  });

  test("reopening an existing Finder returns to the requested ID after previous navigation", () => {
    const requested = create("desktop", "Requested folder");
    const other = create(requested, "Other location");
    openFinder("finder-test", requested, item(requested).name);
    windowState().setFinderLocation("finder-test", other, item(other).name);
    windowState().toggleMinimize("finder-test");
    state().renameFolder(requested, "Requested renamed");
    openFinder("finder-test", requested, item(requested).name);
    assert.equal(Object.keys(windowState().windows).length, 1);
    assert.equal(finder().folderId, requested);
    assert.equal(finder().title, "Requested renamed");
    assert.equal(finder().minimized, false);
    assert.equal(windowState().focusedWindowId, "finder-test");
    assert.deepEqual(finder().folderHistory, [requested, other, requested]);
    assert.equal(finder().folderHistoryIndex, 2);
  });

  test("Finder location updates do not alter other app windows or missing windows", () => {
    windowState().openWindow({ id: "notes", kind: "notes", title: "Notes" });
    const before = windowState().windows;
    windowState().setFinderLocation("notes", "documents", "Documents");
    windowState().setFinderLocation("missing", "documents", "Documents");
    assert.equal(windowState().windows, before);
    assert.equal(finder("notes").title, "Notes");
    assert.equal(finder("notes").folderId, undefined);
  });
});
