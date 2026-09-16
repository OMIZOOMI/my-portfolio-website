"use client";

/**
 * <TactileKeyboard/>
 *
 * Renders nothing itself — it's a controller that mutates existing nodes
 * from your loaded .glb each frame. Mount it as a sibling inside the same
 * <Canvas> tree as wherever those nodes are actually rendered (e.g. inside
 * <Laptop/>, once you've swapped its placeholder geometry for the real
 * model). Usage once that swap happens:
 *
 *   const { nodes } = useGLTF('/models/macbook.glb');
 *   return (
 *     <group>
 *       <primitive object={scene} />
 *       <TactileKeyboard nodes={nodes} />
 *     </group>
 *   );
 *
 * One useFrame loop iterating every mapped key, rather than one per key —
 * cheaper than N separate subscribers, and simpler to reason about.
 */

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { usePhysicalInputState } from "./usePhysicalInputState";
import { KEY_CODE_TO_NODE_NAME, TRACKPAD_NODE_NAME } from "./keyNodeMap";

const KEY_PRESS_DEPTH = 0.008; // world units of downward travel — roughly a keycap's worth
const TRACKPAD_PRESS_DEPTH = 0.004; // shorter travel, matches a real trackpad's near-zero click depth

// Fast on the way down — a physical press should register close to
// instantly, not ease in. A touch slower settling back up, for a light
// mechanical feel rather than a snap. Same "press fast, release gentler"
// language as the dock icons, expressed as damp lambdas instead of springs
// since this is three.js-land, not Framer-land.
const PRESS_DAMP_LAMBDA = 24;
const RELEASE_DAMP_LAMBDA = 10;

interface KeyEntry {
  code: string;
  node: THREE.Object3D;
  restY: number;
}

interface TactileKeyboardProps {
  nodes: Record<string, THREE.Object3D>;
}

export function TactileKeyboard({ nodes }: TactileKeyboardProps) {
  const inputStateRef = usePhysicalInputState();

  const keyEntriesRef = useRef<KeyEntry[]>([]);
  const trackpadRef = useRef<{ node: THREE.Object3D; restY: number } | null>(null);

  // Resolve code -> node once per `nodes` change, not every frame. Missing
  // nodes (a key your .glb doesn't have separated out) are silently
  // skipped rather than throwing, so a partially-separated model still works.
  useEffect(() => {
    keyEntriesRef.current = Object.entries(KEY_CODE_TO_NODE_NAME).reduce<KeyEntry[]>((entries, [code, nodeName]) => {
      const node = nodes[nodeName];
      if (node) entries.push({ code, node, restY: node.position.y });
      return entries;
    }, []);

    const trackpadNode = nodes[TRACKPAD_NODE_NAME];
    trackpadRef.current = trackpadNode ? { node: trackpadNode, restY: trackpadNode.position.y } : null;
  }, [nodes]);

  useFrame((_, delta) => {
    const { pressedKeyCodes, trackpadPressed } = inputStateRef.current;

    for (const { code, node, restY } of keyEntriesRef.current) {
      const isPressed = pressedKeyCodes.has(code);
      const target = isPressed ? restY - KEY_PRESS_DEPTH : restY;
      const lambda = isPressed ? PRESS_DAMP_LAMBDA : RELEASE_DAMP_LAMBDA;
      node.position.y = THREE.MathUtils.damp(node.position.y, target, lambda, delta);
    }

    if (trackpadRef.current) {
      const { node, restY } = trackpadRef.current;
      const target = trackpadPressed ? restY - TRACKPAD_PRESS_DEPTH : restY;
      const lambda = trackpadPressed ? PRESS_DAMP_LAMBDA : RELEASE_DAMP_LAMBDA;
      node.position.y = THREE.MathUtils.damp(node.position.y, target, lambda, delta);
    }
  });

  return null;
}
