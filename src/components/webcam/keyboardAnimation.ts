import * as THREE from "three";
import { KEY_CODE_TO_INDEX, MODEL_KEYS, modelKeyAt } from "./keyboardLayout";
import type { PhysicalInputState } from "./physicalKeyboardInput";

// Original model units are centimetres. +Z points down into the keyboard
// after the model's existing rotation; 0.075 is a restrained 0.75mm travel.
export const KEY_PRESS_DEPTH = 0.075;

export function nextKeyTravel(current: number, pressed: boolean, delta: number, reduceMotion: boolean) {
  const target = pressed ? KEY_PRESS_DEPTH : 0;
  if (reduceMotion) return target;
  const amount = 1 - Math.exp(-(pressed ? 70 : 28) * Math.min(Math.max(delta, 0), 0.05));
  const next = current + (target - current) * amount;
  return Math.abs(target - next) < 0.0001 ? target : next;
}

/** Keep the original four draw calls and all UVs/materials. A static per-vertex
 * key index lets one small shared uniform move each cap, legend and F/J bump
 * together, without creating 78 meshes or uploading geometry on each press. */
export function createAnimatedKeyboardPart(source: THREE.Mesh, travel: { value: Float32Array }) {
  const geometry = source.geometry.clone();
  const position = geometry.getAttribute("position");
  const indices = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) indices[i] = modelKeyAt(position.getX(i), position.getY(i));
  geometry.setAttribute("portfolioKeyIndex", new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  if (geometry.boundingBox) geometry.boundingBox.max.z += KEY_PRESS_DEPTH;
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius += KEY_PRESS_DEPTH;

  const material = (source.material as THREE.MeshStandardMaterial).clone();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.portfolioKeyTravel = travel;
    shader.vertexShader = `attribute float portfolioKeyIndex;\nuniform float portfolioKeyTravel[${MODEL_KEYS.length}];\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\nif (portfolioKeyIndex >= 0.0) transformed.z += portfolioKeyTravel[int(portfolioKeyIndex)];`,
    );
  };
  material.customProgramCacheKey = () => `portfolio-key-travel-${MODEL_KEYS.length}-v1`;
  return { geometry, material, name: source.name };
}

export function createKeyboardRig(nodes: Record<string, THREE.Mesh>) {
  const travel = { value: new Float32Array(MODEL_KEYS.length) };
  const pressed = new Uint8Array(MODEL_KEYS.length);
  const parts = ["Object_67", "Object_71", "Object_73", "Object_75"].map(name => createAnimatedKeyboardPart(nodes[name], travel));
  return {
    parts,
    update(state: PhysicalInputState, now: number, delta: number, reduceMotion: boolean) {
      pressed.fill(0);
      let awaitingRelease = false;
      for (const code of state.pressedKeyCodes) {
        const index = KEY_CODE_TO_INDEX.get(code);
        if (index !== undefined) pressed[index] = 1;
      }
      for (const [code, until] of state.pressedUntil) {
        if (now >= until) { state.pressedUntil.delete(code); continue; }
        const index = KEY_CODE_TO_INDEX.get(code);
        if (index !== undefined) pressed[index] = 1;
        if (!state.pressedKeyCodes.has(code)) awaitingRelease = true;
      }
      let moving = false;
      for (const key of MODEL_KEYS) {
        const current = travel.value[key.index];
        const next = nextKeyTravel(current, pressed[key.index] === 1, delta, reduceMotion);
        if (Math.abs(current - next) > 0.000001) moving = true;
        travel.value[key.index] = next;
      }
      return moving || awaitingRelease;
    },
    dispose() {
      travel.value.fill(0);
      for (const part of parts) { part.geometry.dispose(); part.material.dispose(); }
    },
  };
}
