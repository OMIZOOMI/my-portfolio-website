import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(relative, dependencies = {}, globals = {}) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  runInNewContext(`(function(module,exports,require){${compiled}\n})(module,module.exports,require)`, {
    module: loadedModule, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; }, ...globals,
  }, { filename });
  return loadedModule.exports;
}
const { createPlanarCoordinateSpace } = load("../src/components/window-manager/desktopCoordinates.ts");
const quad = project => ({
  topLeft: project(0, 0), topRight: project(84, 0), bottomRight: project(84, 88), bottomLeft: project(0, 88),
});

test("file drag preserves the true grab offset of a right-side icon under perspective", () => {
  const project = (x, y) => {
    const denominator = 1 + y / 25000;
    return { x: 720 + (x - 700) * 0.675 / denominator, y: 45 + y * 0.69 / denominator };
  };
  const rootSpace = createPlanarCoordinateSpace({ width: 1400, height: 900 }, {
    topLeft: project(0, 0), topRight: project(1400, 0), bottomRight: project(1400, 900), bottomLeft: project(0, 900),
  });
  const itemSpace = createPlanarCoordinateSpace({ width: 84, height: 88 }, quad((x, y) => project(1300 + x, 48 + y)));
  let input;
  class Element { closest() { return null; } }
  const { beginFilePointerDrag } = load("../src/components/desktop/beginFilePointerDrag.ts", {
    "../window-manager/useSystemStore": { useSystemStore: { getState: () => ({ beginPointerDrag(value) { input = value; } }) } },
    "../window-manager/desktopCoordinates": { getDesktopCoordinateSpace: () => itemSpace },
    "./fileDrag": { clientToDesktopLocal: (x, y) => rootSpace.toLocal({ x, y }) },
  }, { Element });
  const pointer = project(1321, 80);
  beginFilePointerDrag({ button: 0, target: new Element(), currentTarget: {}, clientX: pointer.x, clientY: pointer.y, pointerId: 7, stopPropagation() {} }, { id: "projects" });
  assert.ok(input);
  assert.ok(Math.abs(input.grabOffset.x - 21) < 1e-7);
  assert.ok(Math.abs(input.grabOffset.y - 32) < 1e-7);
  assert.equal(input.pointerId, 7);
  const oldBoundingLeft = Math.min(...Object.values(quad((x, y) => project(1300 + x, 48 + y))).map(point => point.x));
  const oldCorner = rootSpace.toLocal({ x: oldBoundingLeft, y: project(1300, 48).y });
  assert.ok(Math.abs(oldCorner.x - 1300) > 2, "the previous bounding-corner approximation would shift this icon");
});

test("unavailable projection does not start a drag with mixed client/local offsets", () => {
  let starts = 0;
  class Element { closest() { return null; } }
  const { beginFilePointerDrag } = load("../src/components/desktop/beginFilePointerDrag.ts", {
    "../window-manager/useSystemStore": { useSystemStore: { getState: () => ({ beginPointerDrag() { starts++; } }) } },
    "../window-manager/desktopCoordinates": { getDesktopCoordinateSpace: () => null },
    "./fileDrag": { clientToDesktopLocal: () => ({ x: 100, y: 100 }) },
  }, { Element });
  beginFilePointerDrag({ button: 0, target: new Element(), currentTarget: {}, clientX: 100, clientY: 100, stopPropagation() {} }, { id: "projects" });
  assert.equal(starts, 0);
});

test("dock panel blocks drops through to a window behind it while empty side strips remain usable", () => {
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right-left, height: bottom-top });
  const frame = { style: { zIndex: "10" }, getBoundingClientRect: () => rect(0, 400, 1400, 900) };
  frame.closest = () => frame;
  const content = { dataset: { finderContent: "desktop" }, closest: () => frame, getBoundingClientRect: frame.getBoundingClientRect };
  const dock = { getBoundingClientRect: () => rect(300, 810, 1100, 884) };
  const document = {
    getElementById: () => null,
    querySelector: selector => selector === "[data-dock-surface]" ? dock : null,
    querySelectorAll: selector => selector === "[data-window-frame]" ? [frame] : selector === "[data-finder-content]" ? [content] : [],
  };
  const { hitTestDrop } = load("../src/components/desktop/fileDrag.ts", { "../window-manager/desktopCoordinates": {} }, { document });
  assert.equal(hitTestDrop(700, 850).target, null, "the visible dock prevents a drop through to Finder");
  assert.equal(hitTestDrop(100, 850).target, "finder", "the empty positioning strip is not a drop barrier");
});
