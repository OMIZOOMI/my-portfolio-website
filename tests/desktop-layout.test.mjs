import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext, runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url), root = fileURLToPath(new URL("../", import.meta.url));
const modules = new Map();
function load(path) {
  const filename = resolve(root, path);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = { exports: {} }; modules.set(filename, loaded);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const localRequire = name => name.startsWith(".") ? load(resolve(dirname(filename), existsSync(resolve(dirname(filename), name + ".ts")) ? name + ".ts" : name)) : require(name);
  runInThisContext(`(function(module,exports,require){${source}\n})`, { filename })(loaded, loaded.exports, localRequire);
  return loaded.exports;
}
const { layoutDesktopIcons, desktopGridPosition, desktopIconMetrics, clampDesktopIconPosition } = load("src/components/desktop/desktopIconLayout.ts");
const { createPlanarCoordinateSpace } = load("src/components/window-manager/desktopCoordinates.ts");
const { DISPLAY_SIZES, ICON_SIZES, DISPLAY_BOOTSTRAP, parseDisplayPreferences } = load("src/data/displayPreferences.ts");
const ids = Array.from({ length: 40 }, (_, i) => `folder-${i}`);
const overlaps = (a, b, m) => a.x < b.x + m.iconWidth && a.x + m.iconWidth > b.x && a.y < b.y + m.iconHeight && a.y + m.iconHeight > b.y;

test("automatic icons anchor to the measured right edge for every text/icon size in both views", () => {
  for (const interfaceScale of DISPLAY_SIZES) for (const iconScale of ICON_SIZES) {
    for (const [width, height] of [[1400, 900], [1800, 1000], [390, 844]]) {
      const layout = { width: width / interfaceScale, height: height / interfaceScale, iconScale };
      const result = layoutDesktopIcons(ids, {}, layout), m = result.metrics;
      assert.ok(Math.abs(layout.width - result.positions[ids[0]].x - m.iconWidth - 16) < 1e-8);
      assert.equal(result.positions[ids[0]].y, m.menuHeight + 16);
      const points = Object.values(result.positions);
      assert.equal(new Set(points.map(p => `${p.x}:${p.y}`)).size, ids.length);
      for (const point of points) {
        assert.ok(point.x >= 0 && point.x + m.iconWidth <= layout.width);
        assert.ok(point.y >= m.menuHeight && point.y + m.iconHeight <= result.contentHeight);
      }
      for (let a = 0; a < points.length; a++) for (let b = a + 1; b < points.length; b++) assert.equal(overlaps(points[a], points[b], m), false);
    }
  }
});

test("a full column wraps left; a full screen continues in a reachable native scroll region", () => {
  const layout = { width: 320, height: 260, iconScale: 1.4 }, m = desktopIconMetrics(layout);
  const first = desktopGridPosition(0, layout), wrapped = desktopGridPosition(m.rows, layout);
  assert.equal(wrapped.y, first.y);
  assert.equal(first.x - wrapped.x, m.iconWidth + m.gap);
  const result = layoutDesktopIcons(ids, {}, layout);
  assert.ok(result.contentHeight > layout.height);
  assert.ok(result.positions[ids[m.rows * m.columns]].y > first.y);
  const maxScroll = result.contentHeight - layout.height;
  assert.ok(result.positions[ids.at(-1)].y + m.iconHeight - maxScroll <= layout.height);
});

test("manual positions survive small/large view round trips and automatic layout avoids them", () => {
  const wide = { width: 1800, height: 1000, iconScale: 1 }, narrow = { width: 390, height: 844, iconScale: 1.4 };
  const manual = { [ids[0]]: { x: 1680, y: 800 } }, before = JSON.stringify(manual);
  const start = layoutDesktopIcons(ids, manual, wide);
  const small = layoutDesktopIcons(ids, manual, narrow);
  assert.ok(small.positions[ids[0]].x + small.metrics.iconWidth <= narrow.width);
  assert.ok(small.positions[ids[0]].y + small.metrics.iconHeight <= narrow.height);
  assert.deepEqual(layoutDesktopIcons(ids, manual, wide).positions[ids[0]], start.positions[ids[0]]);
  assert.equal(JSON.stringify(manual), before, "clamping must not overwrite the visitor's requested position");
  for (const id of ids.slice(1)) assert.equal(overlaps(small.positions[id], small.positions[ids[0]], small.metrics), false);
});

test("manual clamping uses the real lower edge, not the Dock's top, and handles invalid inputs", () => {
  const layout = { width: 1400, height: 900, iconScale: 1 };
  const point = clampDesktopIconPosition({ x: 9999, y: 9999 }, layout);
  assert.equal(point.y, 900 - 116 - 8);
  assert.ok(point.y > 900 - 96 - 116);
  assert.ok(clampDesktopIconPosition({ x: NaN, y: Infinity }, layout).y >= 32);
  for (const size of [{ width: 0, height: 0, iconScale: NaN }, { width: NaN, height: Infinity, iconScale: -1 }]) {
    const result = layoutDesktopIcons(["one"], {}, size);
    assert.ok(Number.isFinite(result.positions.one.x + result.positions.one.y + result.contentHeight));
  }
});

test("automatic and manual icon points use the same projection inverse at zoomed/scaled sizes", () => {
  for (const scale of DISPLAY_SIZES) for (const iconScale of ICON_SIZES) {
    const layout = { width: 1400 / scale, height: 900 / scale, iconScale };
    const quad = { topLeft: { x: 200, y: 90 }, topRight: { x: 1100, y: 105 }, bottomRight: { x: 1080, y: 700 }, bottomLeft: { x: 220, y: 680 } };
    const space = createPlanarCoordinateSpace(layout, quad);
    for (const p of [desktopGridPosition(0, layout), clampDesktopIconPosition({ x: 620, y: 490 }, layout)]) {
      const back = space.toLocal(space.toClient(p));
      assert.ok(Math.abs(back.x - p.x) < 1e-7 && Math.abs(back.y - p.y) < 1e-7);
    }
  }
});

test("prepaint saved-view validation matches hydration without reading or persisting temporary data", () => {
  for (const raw of [null, "null", "false", "[]", "{bad", '{"screenView":true}', '{"defaultView":"screen"}', '{"defaultView":"laptop"}', '{"defaultView":true}', '{"defaultView":"other","windows":{"note":"private"}}']) {
    const attributes = [], reads = [];
    runInNewContext(DISPLAY_BOOTSTRAP, { localStorage: { getItem: key => { reads.push(key); return raw; }, setItem: () => assert.fail("prepaint must not write") }, document: { documentElement: { setAttribute: (...args) => attributes.push(args) } } });
    assert.deepEqual(reads, ["portfolio-readability"]);
    assert.deepEqual(attributes, [["data-portfolio-boot-view", parseDisplayPreferences(raw).defaultView]]);
  }
});
