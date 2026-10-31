"use client";

import { useEffect, useRef } from "react";
import { bindPhysicalKeyboard, createPhysicalInputState } from "./physicalKeyboardInput";

export function usePhysicalInputState(changed: () => void) {
  const stateRef = useRef(createPhysicalInputState());
  useEffect(() => bindPhysicalKeyboard(window, stateRef.current, changed), [changed]);
  return stateRef;
}
