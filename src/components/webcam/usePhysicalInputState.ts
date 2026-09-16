"use client";

/**
 * Pure event-listening — no Three.js here. Deliberately returns a ref, not
 * reactive state: keystrokes and clicks fire far more often than a
 * component should re-render for, and the consumer (TactileKeyboard.tsx)
 * only needs to read this once per animation frame inside useFrame, which
 * already runs outside React's render cycle. Same philosophy as the dock's
 * motion-value-driven magnification — keep anything continuous/frequent
 * off the render cycle entirely.
 */

import { useEffect, useRef } from "react";

export interface PhysicalInputState {
  pressedKeyCodes: Set<string>;
  trackpadPressed: boolean;
}

export function usePhysicalInputState() {
  const stateRef = useRef<PhysicalInputState>({
    pressedKeyCodes: new Set(),
    trackpadPressed: false,
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      stateRef.current.pressedKeyCodes.add(e.code);
    }
    function onKeyUp(e: KeyboardEvent) {
      stateRef.current.pressedKeyCodes.delete(e.code);
    }
    function onMouseDown() {
      stateRef.current.trackpadPressed = true;
    }
    function onMouseUp() {
      stateRef.current.trackpadPressed = false;
    }
    // Defensive: if focus leaves the window mid-press (alt-tab, devtools),
    // don't leave a key visually stuck down forever.
    function onBlur() {
      stateRef.current.pressedKeyCodes.clear();
      stateRef.current.trackpadPressed = false;
    }

    // window-level, not scoped to the canvas — a click or keystroke inside
    // the projected <Html> desktop UI is a real DOM event that bubbles here
    // too, which is what makes "anywhere on the page" work without wiring
    // this into every individual component.
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return stateRef;
}