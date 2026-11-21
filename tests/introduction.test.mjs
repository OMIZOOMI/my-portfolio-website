import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { beforeEach, test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url), root = fileURLToPath(new URL("../", import.meta.url)), cache = new Map();
function load(path) {
  const filename = resolve(root, path);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} }; cache.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const imports = name => name.startsWith(".") ? load(resolve(dirname(filename), `${name}.ts`)) : require(name);
  runInThisContext(`(function(module,exports,require){${output}\n})`, { filename })(loaded, loaded.exports, imports);
  return loaded.exports;
}
const values = new Map(), writes = [];
let readFails = false, writeFails = false;
const storage = { getItem: key => { if (readFails) throw Error("read blocked"); return values.get(key) ?? null; },
  setItem: (key, value) => { if (writeFails) throw Error("write blocked"); writes.push(key); values.set(key, value); },
  removeItem: key => values.delete(key) };
globalThis.window = { localStorage: storage };
globalThis.localStorage = storage;
const { useIntroductionStore: tour, INTRODUCTION_STEPS: steps } = load("src/components/portfolio/useIntroductionStore.ts");
const { INTRODUCTION_STORAGE_KEY: key, parseIntroductionStatus } = load("src/data/introductionPreference.ts");
const { useDisplayStore: display, parseDisplayPreferences } = load("src/components/window-manager/useDisplayStore.ts");
const { useWindowStore: windows } = load("src/components/window-manager/useWindowStore.ts");
const { resetPortfolioSettings } = load("src/components/desktop/resetPortfolioSettings.ts");
beforeEach(() => {
  tour.setState(tour.getInitialState(), true); display.setState(display.getInitialState(), true);
  windows.setState(windows.getInitialState(), true); values.clear(); writes.length = 0; readFails = writeFails = false;
});
function start() { display.getState().hydrate(); tour.getState().hydrate(); tour.getState().start(); }

test("fresh welcome is optional; completed/skipped choices survive release metadata and reload", () => {
  tour.getState().hydrate(); assert.equal(tour.getState().phase, "welcome"); assert.equal(writes.length, 0);
  for (const status of ["completed", "skipped"]) {
    tour.setState(tour.getInitialState(), true); values.set(key, JSON.stringify({ status, version: "an old release" }));
    tour.getState().hydrate(); tour.getState().hydrate(); assert.equal(tour.getState().phase, "dismissed"); assert.equal(tour.getState().status, status);
  }
  for (const raw of [null, "bad", "[]", '"completed"', '{"status":"active"}', '{"status":true}']) assert.equal(parseIntroductionStatus(raw), null);
});
test("skip at welcome and every step restores only the temporary view and writes only its own status", () => {
  for (const stop of ["welcome", ...steps]) {
    tour.setState(tour.getInitialState(), true); display.setState(display.getInitialState(), true); values.clear(); writes.length = 0;
    display.getState().hydrate(); tour.getState().hydrate();
    if (stop !== "welcome") { tour.getState().start(); while (tour.getState().step !== stop) tour.getState().next(tour.getState().step); }
    tour.getState().skip(); tour.getState().skip();
     assert.equal(tour.getState().phase, "dismissed"); assert.equal(display.getState().screenView, true); assert.equal(display.getState().previewReturnView, null);
    assert.equal(display.getState().instantViewChange, true, "dismissal cancels a pending visual transition");
    assert.deepEqual(writes, [key]); assert.equal(JSON.parse(values.get(key)).status, "skipped");
    tour.setState(tour.getInitialState(), true); tour.getState().hydrate(); assert.equal(tour.getState().phase, "dismissed");
  }
});
test("expected-step guards prevent rapid double Next/Back from skipping reading stages", () => {
  start();
  assert.equal(tour.getState().step, "laptop"); assert.equal(display.getState().screenView, false);
  tour.getState().next("laptop"); tour.getState().next("laptop"); assert.equal(tour.getState().step, "screen");
  assert.equal(display.getState().screenView, true); assert.equal(values.has("portfolio-readability"), false, "a tour demonstration is never persisted");
  tour.getState().back("screen"); tour.getState().back("screen"); assert.equal(tour.getState().step, "laptop"); assert.equal(display.getState().screenView, false);
  tour.getState().back("laptop"); assert.equal(tour.getState().phase, "welcome"); assert.equal(display.getState().screenView, true);
});
test("a saved Laptop visit returns there when skipping the temporary Screen demonstration", () => {
  values.set("portfolio-readability", JSON.stringify({ defaultView: "laptop" }));
  start();
  assert.equal(tour.getState().step, "laptop"); assert.equal(display.getState().screenView, false);
  for (const step of ["laptop", "screen", "projects", "terminal", "contact"]) {
    tour.getState().next(step); assert.equal(display.getState().screenView, true);
  }
  tour.getState().skip(); assert.equal(display.getState().screenView, false);
  assert.deepEqual(writes, [key]);
});
test("the flat desktop starts in Screen and never offers an unsupported saved Laptop choice", () => {
  display.getState().hydrate(); tour.getState().hydrate(); tour.getState().start(false);
  assert.equal(tour.getState().laptopAvailable, false); assert.equal(tour.getState().step, "screen");
  assert.equal(display.getState().screenView, true); assert.equal(display.getState().previewReturnView, null);
  tour.getState().back("screen"); assert.equal(tour.getState().phase, "welcome");
  tour.getState().start(false);
  for (const step of steps) tour.getState().next(step);
  tour.getState().finish("laptop"); assert.equal(tour.getState().phase, "active"); assert.deepEqual(writes, []);
  tour.getState().finish("screen"); assert.equal(tour.getState().phase, "dismissed");
  assert.deepEqual(writes, ["portfolio-readability", key]);
});
test("completion persists only an explicit view choice and keeps existing work and identities", () => {
  for (const view of ["screen", "laptop"]) {
    tour.setState(tour.getInitialState(), true); display.setState(display.getInitialState(), true); values.clear();
    windows.getState().openWindow({ id: "app-notes", kind: "notes", title: "Keep work" }); const existing = windows.getState().windows;
    start(); tour.getState().finish("screen"); assert.equal(tour.getState().phase, "active", "cannot finish an earlier step");
    for (const step of steps) tour.getState().next(step);
    tour.getState().finish(view); tour.getState().finish(view);
    assert.equal(display.getState().defaultView, view); assert.equal(display.getState().screenView, view === "screen");
    assert.ok(values.has("portfolio-readability"), "explicitly choosing the default still saves it");
    assert.equal(parseDisplayPreferences(values.get("portfolio-readability")).defaultView, view);
    assert.equal(JSON.parse(values.get(key)).status, "completed"); assert.equal(windows.getState().windows, existing);
    tour.getState().replay(); assert.equal(tour.getState().phase, "welcome"); tour.getState().skip(); assert.equal(JSON.parse(values.get(key)).status, "completed");
  }
});
test("blocked reads and writes still allow skip/completion and prevent repeat during the mounted visit", () => {
  readFails = writeFails = true; start(); assert.equal(tour.getState().storageAvailable, false);
  tour.getState().skip(); tour.getState().hydrate(); assert.equal(tour.getState().phase, "dismissed");
  assert.equal(tour.getState().storageAvailable, false); assert.equal(display.getState().previewReturnView, null);
  tour.getState().replay(); tour.getState().start(); for (const step of steps) tour.getState().next(step); tour.getState().finish("screen");
  assert.equal(tour.getState().phase, "dismissed"); assert.equal(tour.getState().storageAvailable, false);
});
test("a blocked read is not reported as reliable persistence just because a later write succeeds", () => {
  readFails = true; start(); tour.getState().skip();
  assert.equal(tour.getState().storageAvailable, false); assert.equal(tour.getState().phase, "dismissed");
  assert.equal(JSON.parse(values.get(key)).status, "skipped");
});
test("preference reset preserves actual introduction state and saved completion, not just a fixture key", () => {
  start(); tour.getState().skip(); const saved = values.get(key); const state = tour.getState();
  resetPortfolioSettings(); assert.equal(values.get(key), saved); assert.equal(tour.getState(), state);
});
