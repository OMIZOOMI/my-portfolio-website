import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const filename = fileURLToPath(new URL("../src/components/window-manager/windowGeometry.ts", import.meta.url));
const loadedModule = { exports: {} };
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
runInThisContext(`(function(module, exports) { ${compiled}\n})`, { filename })(loadedModule, loadedModule.exports);
const {
  getDesktopWorkArea, getMaximizedWindowRect, constrainWindowPosition,
  clampWindowRect, getWindowFrameSize, getWindowContentSize,
} = loadedModule.exports;

test("maximize reserves the measured menu and visible dock footprint in virtual desktop units", () => {
  const desktop = { width: 1400, height: 900 };
  const area = getDesktopWorkArea(desktop, { top: 28, bottom: 90 });
  assert.deepEqual(area, { x: 0, y: 28, width: 1400, height: 782 });
  assert.deepEqual(getMaximizedWindowRect(area), area);
  assert.notEqual(getMaximizedWindowRect(area), area, "the saved area is not mutable through the returned rectangle");
  const content = getWindowContentSize(area);
  assert.deepEqual(content, { width: 1398, height: 744 });
  assert.deepEqual(getWindowFrameSize(content), { width: 1400, height: 782 });
});

test("work area responds to dock size and dock visibility without browser dimensions", () => {
  assert.deepEqual(getDesktopWorkArea({ width: 1400, height: 900 }, { top: 28, bottom: 118 }),
    { x: 0, y: 28, width: 1400, height: 754 });
  assert.deepEqual(getDesktopWorkArea({ width: 1400, height: 900 }, { top: 28, bottom: 0 }),
    { x: 0, y: 28, width: 1400, height: 872 });
  assert.deepEqual(getDesktopWorkArea({ width: 700, height: 480 }, { top: 28, right: 10, bottom: 90, left: 10 }),
    { x: 10, y: 28, width: 680, height: 362 });
});

test("drag clamping keeps the complete frame reachable at each edge", () => {
  const area = { x: 10, y: 28, width: 1380, height: 782 };
  const size = getWindowFrameSize({ width: 640, height: 440 });
  assert.deepEqual(constrainWindowPosition({ x: -500, y: -300 }, size, area), { x: 10, y: 28 });
  assert.deepEqual(constrainWindowPosition({ x: 5000, y: 5000 }, size, area), { x: 748, y: 332 });
  assert.deepEqual(constrainWindowPosition({ x: 250, y: 150 }, size, area), { x: 250, y: 150 });
  assert.deepEqual(constrainWindowPosition({ x: 200, y: 200 }, { width: 2000, height: 1000 }, area), { x: 10, y: 28 });
});

test("restore fits changed bounds without overwriting the remembered rectangle", () => {
  const saved = Object.freeze({ x: 1100, y: 650, width: 642, height: 478 });
  const smaller = getDesktopWorkArea({ width: 800, height: 600 }, { top: 28, bottom: 90 });
  assert.deepEqual(clampWindowRect(saved, smaller, { width: 320, height: 180 }),
    { x: 158, y: 32, width: 642, height: 478 });
  assert.deepEqual(saved, { x: 1100, y: 650, width: 642, height: 478 });
  const tiny = getDesktopWorkArea({ width: 200, height: 200 }, { top: 28, bottom: 90 });
  assert.deepEqual(clampWindowRect(saved, tiny, { width: 320, height: 180 }),
    { x: 0, y: 28, width: 200, height: 82 });
});

test("content and outer geometry round trip without a title bar or border overflow", () => {
  for (const size of [{ width: 640, height: 440 }, { width: 320, height: 120 }, { width: 1398, height: 744 }]) {
    assert.deepEqual(getWindowContentSize(getWindowFrameSize(size)), size);
    assert.deepEqual(getWindowContentSize(getWindowFrameSize(size, 40, 2), 40, 2), size);
  }
  assert.deepEqual(getWindowContentSize({ width: 1, height: 1 }), { width: 0, height: 0 });
});

test("invalid measurements and exhausted insets never produce NaN or inverted work areas", () => {
  assert.deepEqual(getDesktopWorkArea({ width: NaN, height: -5 }, { top: 28, bottom: Infinity }),
    { x: 0, y: 0, width: 0, height: 0 });
  assert.deepEqual(getDesktopWorkArea({ width: 100, height: 100 }, { top: 200, right: 200, bottom: 200, left: 200 }),
    { x: 100, y: 100, width: 0, height: 0 });
  assert.deepEqual(clampWindowRect({ x: NaN, y: Infinity, width: NaN, height: -4 }, { x: 0, y: 28, width: 100, height: 50 }, { width: 80, height: 40 }),
    { x: 0, y: 28, width: 80, height: 40 });
});

test("fitting across many desktop sizes always keeps all frame edges within the work area", () => {
  for (let index = 1; index <= 400; index++) {
    const area = getDesktopWorkArea({ width: (index * 37) % 1900, height: (index * 61) % 1200 }, { top: 28, bottom: (index * 13) % 150 });
    const rect = clampWindowRect({ x: index * 19 - 2000, y: index * 7 - 1000, width: index * 11, height: index * 5 }, area, { width: 240, height: 160 });
    assert.ok(rect.x >= area.x && rect.y >= area.y);
    assert.ok(rect.x + rect.width <= area.x + area.width);
    assert.ok(rect.y + rect.height <= area.y + area.height);
  }
});
