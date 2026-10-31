import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const THREE = require("three");
const loaded = new Map();
function load(name) {
  if (loaded.has(name)) return loaded.get(name);
  const file = new URL(`../src/components/webcam/${name}.ts`, import.meta.url);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loadedModule = { exports: {} };
  runInThisContext(`(function(module,exports,require){${output}\n})`, { filename: file.pathname })(loadedModule, loadedModule.exports, dependency => dependency.startsWith("./") ? load(dependency.slice(2)) : require(dependency));
  loaded.set(name, loadedModule.exports);
  return loadedModule.exports;
}
const { MODEL_KEYS, KEY_CODE_TO_INDEX, modelKeyAt } = load("keyboardLayout");
const { bindPhysicalKeyboard, createPhysicalInputState, KEY_TAP_HOLD_MS } = load("physicalKeyboardInput");
const { createAnimatedKeyboardPart, createKeyboardRig, nextKeyTravel, KEY_PRESS_DEPTH } = load("keyboardAnimation");

const gltf = JSON.parse(fs.readFileSync(new URL("../public/macbook.glb/scene.gltf", import.meta.url), "utf8"));
const binary = fs.readFileSync(new URL("../public/macbook.glb/scene.bin", import.meta.url));
function attribute(index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const count = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const bytes = { 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
  const array = new ({ 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[accessor.componentType])(accessor.count * count);
  for (let i = 0; i < accessor.count; i++) for (let k = 0; k < count; k++) {
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? count * bytes) + k * bytes;
    array[i * count + k] = accessor.componentType === 5126 ? binary.readFloatLE(offset) : accessor.componentType === 5125 ? binary.readUInt32LE(offset) : binary.readUInt16LE(offset);
  }
  return new THREE.BufferAttribute(array, count);
}
function actualMesh(name) {
  const node = gltf.nodes.find(node => node.name === name);
  const primitive = gltf.meshes[node.mesh].primitives[0];
  const geometry = new THREE.BufferGeometry();
  for (const [key, index] of Object.entries(primitive.attributes)) geometry.setAttribute(({ POSITION: "position", NORMAL: "normal", TANGENT: "tangent", TEXCOORD_0: "uv", TEXCOORD_1: "uv1" })[key] ?? key, attribute(index));
  geometry.setIndex(attribute(primitive.indices));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#242424", roughness: 0.7 }));
  mesh.name = name;
  return mesh;
}

test("78 measured key regions are unique, disjoint, and map browser physical positions", () => {
  assert.equal(MODEL_KEYS.length, 78);
  assert.equal(new Set(MODEL_KEYS.map(key => key.code)).size, 78);
  for (const key of MODEL_KEYS) assert.equal(modelKeyAt((key.left + key.right) / 2, (key.back + key.front) / 2), key.index);
  for (const code of ["KeyA", "KeyZ", "Digit0", "Space", "Enter", "Backspace", "Tab", "MetaLeft", "MetaRight", "ArrowUp", "Quote", "Slash", "F12"]) assert.ok(KEY_CODE_TO_INDEX.has(code));
  assert.equal(KEY_CODE_TO_INDEX.get("NumpadEnter"), KEY_CODE_TO_INDEX.get("Enter"));
  assert.equal(modelKeyAt(0, 5), -1, "trackpad cannot be mistaken for a key");
});

test("every actual keycap/legend/Touch ID vertex is mapped; no triangle spans two keys", () => {
  const occupied = new Set();
  for (const name of ["Object_67", "Object_71", "Object_73", "Object_75"]) {
    const source = actualMesh(name);
    const part = createAnimatedKeyboardPart(source, { value: new Float32Array(78) });
    const keys = part.geometry.getAttribute("portfolioKeyIndex");
    for (const id of keys.array) { assert.ok(id >= 0 && id < 78, `${name}: unmapped vertex`); occupied.add(id); }
    const indices = part.geometry.index.array;
    for (let i = 0; i < indices.length; i += 3) {
      assert.equal(keys.getX(indices[i]), keys.getX(indices[i + 1]), `${name}: split triangle`);
      assert.equal(keys.getX(indices[i]), keys.getX(indices[i + 2]), `${name}: split triangle`);
    }
    for (const [key, attr] of Object.entries(source.geometry.attributes)) assert.deepEqual(part.geometry.getAttribute(key).array, attr.array);
    assert.equal(source.geometry.getAttribute("portfolioKeyIndex"), undefined, "cached GLTF remains untouched");
    assert.notEqual(part.material, source.material);
    part.geometry.dispose(); part.material.dispose(); source.geometry.dispose(); source.material.dispose();
  }
  assert.equal(occupied.size, 78);
});

test("shader displaces originals along the model's downward axis with a shared small uniform", () => {
  const source = actualMesh("Object_73");
  const travel = { value: new Float32Array(78) };
  const part = createAnimatedKeyboardPart(source, travel);
  const shader = { uniforms: {}, vertexShader: "void main(){\n#include <begin_vertex>\n}", fragmentShader: "original texture/lighting" };
  part.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.portfolioKeyTravel, travel);
  assert.match(shader.vertexShader, /transformed\.z \+= portfolioKeyTravel\[int\(portfolioKeyIndex\)\]/);
  assert.equal(shader.fragmentShader, "original texture/lighting");
  const down = new THREE.Vector3(0, 0, KEY_PRESS_DEPTH).applyEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  assert.ok(down.y < 0, "existing combined model rotation converts +Z to down");
});

test("travel is bounded, frame-rate independent, quick down and settled on release", () => {
  const run = hz => { let value = 0; for (let i = 0; i < hz / 5; i++) value = nextKeyTravel(value, true, 1 / hz, false); return value; };
  assert.ok(Math.abs(run(60) - run(120)) < 0.0001);
  assert.ok(nextKeyTravel(0, true, 1 / 60, false) > KEY_PRESS_DEPTH / 2);
  let value = run(60);
  for (let i = 0; i < 60; i++) { value = nextKeyTravel(value, false, 1 / 60, false); assert.ok(value >= 0 && value <= KEY_PRESS_DEPTH); }
  assert.equal(value, 0);
  assert.equal(nextKeyTravel(0, true, 1 / 60, true), KEY_PRESS_DEPTH);
  assert.equal(nextKeyTravel(KEY_PRESS_DEPTH, false, 1 / 60, true), 0);
});

function inputFixture() {
  const handlers = new Map(), docHandlers = new Map();
  const state = createPhysicalInputState();
  let now = 10, changes = 0;
  const doc = { hidden: false, addEventListener: (name, handler) => docHandlers.set(name, handler), removeEventListener: name => docHandlers.delete(name) };
  const view = {
    document: doc, performance: { now: () => now },
    addEventListener(name, handler, capture) { if (/^key/.test(name)) assert.equal(capture, true); handlers.set(name, handler); },
    removeEventListener: name => handlers.delete(name),
  };
  const cleanup = bindPhysicalKeyboard(view, state, () => { changes++; });
  const emit = (type, code) => handlers.get(type)?.({ code, preventDefault() { assert.fail("typing/shortcut canceled"); }, stopPropagation() { assert.fail("typing stopped"); } });
  return { state, doc, emit, handlers, docHandlers, cleanup, setNow: value => { now = value; }, changes: () => changes };
}

test("quick taps latch long enough to render, held chords/repeats keep independent state", () => {
  const f = inputFixture();
  f.emit("keydown", "KeyA"); f.emit("keyup", "KeyA");
  assert.equal(f.state.pressedKeyCodes.size, 0);
  assert.equal(f.state.pressedUntil.get("KeyA"), 10 + KEY_TAP_HOLD_MS);
  f.emit("keydown", "ShiftLeft"); f.emit("keydown", "KeyZ");
  f.setNow(40); f.emit("keydown", "KeyZ");
  assert.equal(f.state.pressedUntil.get("KeyZ"), 90, "repeat doesn't allocate/extend a fake pulse");
  assert.equal(f.state.pressedKeyCodes.size, 2);
  f.emit("keyup", "KeyZ");
  assert.ok(f.state.pressedKeyCodes.has("ShiftLeft"));
  f.emit("keydown", "Unknown");
  assert.equal(f.state.pressedKeyCodes.size, 1);
});

test("Command release, blur and hiding prevent stuck keys; cleanup removes all observers", () => {
  const f = inputFixture();
  f.emit("keydown", "MetaLeft"); f.emit("keydown", "KeyS"); f.emit("keyup", "MetaLeft");
  assert.equal(f.state.pressedKeyCodes.size, 0);
  assert.equal(f.state.pressedUntil.has("KeyS"), false);
  f.emit("keydown", "Space"); f.handlers.get("blur")();
  assert.equal(f.state.pressedUntil.size, 0);
  f.emit("keydown", "KeyA"); f.doc.hidden = true; f.docHandlers.get("visibilitychange")();
  assert.equal(f.state.pressedKeyCodes.size, 0);
  f.cleanup();
  assert.equal(f.handlers.size, 0); assert.equal(f.docHandlers.size, 0);
});

test("input drives only its matched caps/legends, supports chords, and settles with no perpetual invalidation", () => {
  const sources = Object.fromEntries(["Object_67", "Object_71", "Object_73", "Object_75"].map(name => [name, actualMesh(name)]));
  const rig = createKeyboardRig(sources);
  const uniforms = rig.parts.map(part => {
    const shader = { uniforms: {}, vertexShader: "#include <begin_vertex>" };
    part.material.onBeforeCompile(shader);
    return shader.uniforms.portfolioKeyTravel;
  });
  assert.ok(uniforms.every(uniform => uniform === uniforms[0]));
  const f = inputFixture();
  f.emit("keydown", "KeyA"); f.emit("keydown", "ShiftLeft");
  assert.equal(rig.update(f.state, 20, 1 / 60, false), true);
  const travel = uniforms[0].value;
  assert.ok(travel[KEY_CODE_TO_INDEX.get("KeyA")] > 0);
  assert.ok(travel[KEY_CODE_TO_INDEX.get("ShiftLeft")] > 0);
  assert.equal(travel[KEY_CODE_TO_INDEX.get("KeyB")], 0);
  f.handlers.get("blur")();
  for (let i = 0; i < 90; i++) rig.update(f.state, 100 + i * 1000 / 60, 1 / 60, false);
  assert.ok(travel.every(value => value === 0));
  assert.equal(rig.update(f.state, 2000, 1 / 60, false), false);
  rig.dispose(); f.cleanup();
  for (const source of Object.values(sources)) { source.geometry.dispose(); source.material.dispose(); }
});
