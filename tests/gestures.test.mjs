import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import { handPose, mirrorHand, scaleAndTranslateHand } from "./fixtures/hand-landmarks.mjs";

// Test the production classifier without loading a browser or a GPU. All
// landmarks are synthetic fixtures; this does not claim hardware parity.
const filename = fileURLToPath(new URL("../src/components/webcam/GestureClassifier.ts", import.meta.url));
const loadedModule = { exports: {} };
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
runInThisContext(`(function(module, exports, require) { ${compiled}\n})`, { filename })(
  loadedModule, loadedModule.exports, createRequire(import.meta.url)
);
const { classifyGesture } = loadedModule.exports;
const gateFilename = fileURLToPath(new URL("../src/components/webcam/gestureTriggerGate.ts", import.meta.url));
const gateModule = { exports: {} };
const compiledGate = ts.transpileModule(readFileSync(gateFilename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
runInThisContext(`(function(module, exports, require) { ${compiledGate}\n})`, { filename: gateFilename })(
  gateModule, gateModule.exports, createRequire(import.meta.url)
);
const { createGestureTriggerGate } = gateModule.exports;

test("controlled peace/thumbs-up fixtures and horizontal mirrors have identical classifications", () => {
  for (const gesture of ["peace", "thumbsup"]) {
    const hand = handPose(gesture);
    assert.equal(classifyGesture(hand), gesture);
    assert.equal(classifyGesture(mirrorHand(hand)), gesture);
    assert.equal(classifyGesture(mirrorHand(mirrorHand(hand))), gesture);
  }
});

test("the recognized fixtures remain stable under scale and image-position changes", () => {
  for (const gesture of ["peace", "thumbsup"]) {
    for (const [scale, dx, dy] of [[0.45, 0.2, 0.2], [0.8, -0.1, 0.05], [1.1, -0.05, -0.05]]) {
      assert.equal(classifyGesture(scaleAndTranslateHand(handPose(gesture), scale, dx, dy)), gesture);
    }
  }
});

test("fist, open palm, no hand, and a sideways thumb do not produce a supported gesture", () => {
  assert.equal(classifyGesture(handPose("fist")), "none");
  assert.equal(classifyGesture(handPose("open-palm")), "none");
  assert.equal(classifyGesture([]), "none");
  assert.equal(classifyGesture(null), "none");
  const sidewaysThumb = handPose("thumbsup");
  sidewaysThumb[4] = { x: 0.03, y: 0.56, z: 0 };
  assert.equal(classifyGesture(sidewaysThumb), "none");
});

test("peace deliberately tolerates either thumb resting position but not an extended ring finger", () => {
  const peace = handPose("peace");
  peace[4] = { x: 0.08, y: 0.43, z: 0 };
  assert.equal(classifyGesture(peace), "peace");
  peace[16] = { x: 0.60, y: 0.28, z: 0 };
  assert.equal(classifyGesture(peace), "none");
});

test("finger extension uses the strict 1.15 wrist-distance margin", () => {
  const hand = handPose("peace");
  // Make the index distances axis aligned so the boundary is exact.
  hand[0] = { x: 0, y: 0, z: 0 };
  hand[6] = { x: 1, y: 0, z: 0 };
  hand[8] = { x: 1.15, y: 0, z: 0 };
  // Other fingers must remain well defined relative to this wrist.
  hand[10] = { x: 1, y: 0, z: 0 };
  hand[12] = { x: 1.5, y: 0, z: 0 };
  for (const [pip, tip] of [[14, 16], [18, 20]]) {
    hand[pip] = { x: 1, y: 0, z: 0 };
    hand[tip] = { x: 0.5, y: 0, z: 0 };
  }
  assert.equal(classifyGesture(hand), "none");
  hand[8].x += 0.000001;
  assert.equal(classifyGesture(hand), "peace");
});

test("incomplete/non-finite detections safely reset to none instead of throwing or partially classifying", () => {
  assert.equal(classifyGesture(handPose("peace").slice(0, 20)), "none");
  for (const bad of [undefined, { x: NaN, y: 0.5, z: 0 }, { x: 0.5, y: Infinity, z: 0 }]) {
    const hand = handPose("peace");
    hand[3] = bad;
    assert.equal(classifyGesture(hand), "none");
  }
});

test("a recognized held pose fires once even after many cooldown intervals", () => {
  const gate = createGestureTriggerGate();
  const hand = handPose("peace");
  const outputs = [];
  for (let now = 0; now <= 15000; now += 16) {
    const result = gate.update(classifyGesture(hand), now);
    if (result) outputs.push(result);
  }
  assert.deepEqual(outputs, ["peace"]);
});

test("no-hand releases a held pose without bypassing the global cooldown", () => {
  const gate = createGestureTriggerGate();
  assert.equal(gate.update("peace", 0), "peace");
  assert.equal(gate.update("none", 100), null);
  assert.equal(gate.update("peace", 500), null);
  assert.equal(gate.update("peace", 2499), null);
  assert.equal(gate.update("peace", 2500), "peace");
  assert.equal(gate.update("peace", 5000), null);
});

test("a different pose entered during cooldown fires once when eligible while held", () => {
  const gate = createGestureTriggerGate();
  assert.equal(gate.update("peace", 100), "peace");
  assert.equal(gate.update("thumbsup", 200), null);
  assert.equal(gate.update("thumbsup", 2599), null);
  assert.equal(gate.update("thumbsup", 2600), "thumbsup");
  assert.equal(gate.update("thumbsup", 10000), null);
});

test("a short pose that disappears during cooldown does not fire later", () => {
  const gate = createGestureTriggerGate();
  assert.equal(gate.update("peace", 0), "peace");
  assert.equal(gate.update("thumbsup", 400), null);
  assert.equal(gate.update("none", 500), null);
  assert.equal(gate.update("none", 3000), null);
  assert.equal(gate.update("peace", 3001), "peace");
});

test("reset removes stale pose and cooldown state on a new camera/inference session", () => {
  const gate = createGestureTriggerGate();
  assert.equal(gate.update("thumbsup", 100), "thumbsup");
  gate.reset();
  assert.equal(gate.update("none", 200), null);
  assert.equal(gate.update("thumbsup", 201), "thumbsup");
  assert.equal(gate.update("thumbsup", 3000), null);
});

test("cooldown is configurable and invalid clock samples cannot produce effects", () => {
  const gate = createGestureTriggerGate(100);
  assert.equal(gate.update("peace", NaN), null);
  assert.equal(gate.update("peace", 0), "peace");
  assert.equal(gate.update("thumbsup", 99), null);
  assert.equal(gate.update("thumbsup", 100), "thumbsup");
});
