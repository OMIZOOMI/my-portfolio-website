"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { usePhysicalInputState } from "./usePhysicalInputState";
import { createKeyboardRig } from "./keyboardAnimation";

export function TactileKeyboard({ nodes, reduceMotion }: { nodes: Record<string, THREE.Mesh>; reduceMotion: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  const input = usePhysicalInputState(invalidate);
  const rig = useMemo(() => createKeyboardRig(nodes), [nodes]);

  useEffect(() => () => rig.dispose(), [rig]);

  useFrame((_, delta) => {
    // Also works with demand rendering: wake only through the press/release.
    if (rig.update(input.current, performance.now(), delta, reduceMotion)) invalidate();
  });

  return <>{rig.parts.map((part) => <mesh key={part.name} name={`keyboard-${part.name}`} geometry={part.geometry} material={part.material} dispose={null} />)}</>;
}
