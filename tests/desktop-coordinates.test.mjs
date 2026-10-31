import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const filename = fileURLToPath(new URL("../src/components/window-manager/desktopCoordinates.ts", import.meta.url));
const loadedModule = { exports: {} };
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
runInThisContext(`(function(module, exports) { ${compiled}\n})`, { filename })(loadedModule, loadedModule.exports);
const { createPlanarCoordinateSpace, getDesktopCoordinateSpace } = loadedModule.exports;
const near = (actual, expected, tolerance = 1e-7) => {
  assert.ok(actual, "conversion must exist");
  assert.ok(Math.abs(actual.x - expected.x) <= tolerance, `x: ${actual.x} vs ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) <= tolerance, `y: ${actual.y} vs ${expected.y}`);
};
const quadFrom = (width, height, project) => ({
  topLeft: project({ x: 0, y: 0 }), topRight: project({ x: width, y: 0 }),
  bottomRight: project({ x: width, y: height }), bottomLeft: project({ x: 0, y: height }),
});

test("identity and translated anisotropic projections convert both axes independently", () => {
  for (const project of [({ x, y }) => ({ x, y }), ({ x, y }) => ({ x: 85 + x * 0.7, y: 120 + y * 0.43 })]) {
    const space = createPlanarCoordinateSpace({ width: 1400, height: 900 }, quadFrom(1400, 900, project));
    for (const point of [{ x: 0, y: 0 }, { x: 400, y: 700 }, { x: 1400, y: 900 }, { x: -30, y: 1000 }]) {
      near(space.toClient(point), project(point));
      near(space.toLocal(project(point)), point);
    }
  }
});

test("affine rotation, skew, and reflection retain ordered local corners", () => {
  for (const project of [
    ({ x, y }) => ({ x: 700 + x * 0.4 - y * 0.13, y: 20 + x * 0.08 + y * 0.5 }),
    ({ x, y }) => ({ x: 1000 - x * 0.4, y: 20 + y * 0.5 }),
  ]) {
    const space = createPlanarCoordinateSpace({ width: 1400, height: 900 }, quadFrom(1400, 900, project));
    near(space.toClient({ x: 350, y: 750 }), project({ x: 350, y: 750 }));
    near(space.toLocal(project({ x: 350, y: 750 })), { x: 350, y: 750 });
  }
});

test("perspective projection and inverse round-trip points across and outside a trapezoid", () => {
  const project = ({ x, y }) => {
    const u = x / 1400;
    const v = y / 900;
    const denominator = 1 + 0.25 * u - 0.12 * v;
    return { x: 100 + (600 * u + 45 * v) / denominator, y: 70 + (30 * u + 440 * v) / denominator };
  };
  const space = createPlanarCoordinateSpace({ width: 1400, height: 900 }, quadFrom(1400, 900, project));
  for (let x = -200; x <= 1600; x += 100) {
    for (let y = -100; y <= 1000; y += 100) {
      near(space.toClient({ x, y }), project({ x, y }));
      near(space.toLocal(project({ x, y })), { x, y });
    }
  }
  const center = project({ x: 700, y: 450 });
  const quad = quadFrom(1400, 900, project);
  const approximateX = (center.x - quad.topLeft.x) / (quad.topRight.x - quad.topLeft.x) * 1400;
  assert.ok(Math.abs(approximateX - 700) > 50, "a rectangle-ratio conversion would have visibly misplaced this pointer");
});

test("invalid, singular, folded, and concave projections are rejected safely", () => {
  const identity = quadFrom(100, 100, (point) => point);
  assert.equal(createPlanarCoordinateSpace({ width: 0, height: 100 }, identity), null);
  assert.equal(createPlanarCoordinateSpace({ width: Infinity, height: 100 }, identity), null);
  assert.equal(createPlanarCoordinateSpace({ width: 100, height: 100 }, { ...identity, topLeft: { x: NaN, y: 0 } }), null);
  assert.equal(createPlanarCoordinateSpace({ width: 100, height: 100 }, quadFrom(100, 100, ({ x }) => ({ x, y: 0 }))), null);
  assert.equal(createPlanarCoordinateSpace({ width: 100, height: 100 }, { ...identity, bottomLeft: identity.bottomRight, bottomRight: identity.bottomLeft }), null);
  assert.equal(createPlanarCoordinateSpace({ width: 100, height: 100 }, { ...identity, bottomRight: { x: 20, y: 20 } }), null);
});

test("non-finite input points and projective horizons return null without clamping valid outside points", () => {
  const project = ({ x, y }) => ({ x: x / (1 + x * 0.5 + y * 0.5), y: y / (1 + x * 0.5 + y * 0.5) });
  const space = createPlanarCoordinateSpace({ width: 1, height: 1 }, quadFrom(1, 1, project));
  assert.equal(space.toClient({ x: -1, y: -1 }), null);
  assert.equal(space.toLocal({ x: 1, y: 1 }), null);
  assert.equal(space.toLocal({ x: NaN, y: 0 }), null);
  assert.equal(space.toClient({ x: 0, y: Infinity }), null);
  near(space.toLocal(project({ x: -0.1, y: 0.5 })), { x: -0.1, y: 0.5 });
});

function fakeDesktop() {
  const root = {
    clientWidth: 1400, clientHeight: 900, children: [], offsetX: 100, offsetY: 70, scaleX: 0.6, scaleY: 0.4,
    getBoundingClientRect() {
      return { left: this.offsetX, top: this.offsetY, right: this.offsetX + this.clientWidth * this.scaleX, bottom: this.offsetY + this.clientHeight * this.scaleY, width: this.clientWidth * this.scaleX, height: this.clientHeight * this.scaleY };
    },
    appendChild(probe) { probe.parentElement = this; this.children.push(probe); },
    ownerDocument: {
      createElement() {
        return {
          attributes: {}, style: {}, parentElement: null,
          setAttribute(name, value) { this.attributes[name] = value; },
          remove() {
            if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
            this.parentElement = null;
          },
          getBoundingClientRect() {
            const parent = this.parentElement;
            const x = this.style.right === "0" ? parent.clientWidth : 0;
            const y = this.style.bottom === "0" ? parent.clientHeight : 0;
            return { left: parent.offsetX + x * parent.scaleX, top: parent.offsetY + y * parent.scaleY };
          },
        };
      },
    },
  };
  return root;
}

test("DOM coordinate probes are inert and reused while live camera/zoom/layout measurements stay fresh", () => {
  const root = fakeDesktop();
  let space = getDesktopCoordinateSpace(root);
  assert.equal(root.children.length, 4);
  const probes = [...root.children];
  for (const probe of probes) {
    assert.equal(probe.attributes["aria-hidden"], "true");
    assert.equal(probe.style.pointerEvents, "none");
    assert.equal(probe.style.width, "0");
  }
  near(space.toLocal({ x: 520, y: 250 }), { x: 700, y: 450 });
  root.offsetX = 40;
  root.offsetY = 30;
  root.scaleX = 0.8;
  root.scaleY = 0.5;
  root.clientWidth = 1000;
  root.clientHeight = 600;
  space = getDesktopCoordinateSpace(root);
  assert.deepEqual(root.children, probes, "pointer movement does not append or restyle probes");
  near(space.toLocal({ x: 440, y: 180 }), { x: 500, y: 300 });
  near(space.toClient({ x: 1000, y: 600 }), { x: 840, y: 330 });
  root.children[1].remove();
  space = getDesktopCoordinateSpace(root);
  assert.equal(root.children.length, 4, "an externally removed probe set is replaced without leaving partial nodes");
  near(space.toClient({ x: 500, y: 300 }), { x: 440, y: 180 });
});

test("invalid DOM probes fall back to the root rectangle and hidden/zero-size desktops return null", () => {
  const root = fakeDesktop();
  getDesktopCoordinateSpace(root);
  for (const probe of root.children) probe.getBoundingClientRect = () => ({ left: 0, top: 0 });
  const fallback = getDesktopCoordinateSpace(root);
  near(fallback.toLocal({ x: 520, y: 250 }), { x: 700, y: 450 });
  root.clientWidth = 0;
  assert.equal(getDesktopCoordinateSpace(root), null);
  root.clientWidth = 1400;
  root.scaleX = 0;
  assert.equal(getDesktopCoordinateSpace(root), null);
});
