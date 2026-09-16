"use client";

import { useEffect, type RefObject } from "react";

// Cross-platform wheel normalization.
//
// Mac trackpads emit continuous pixel deltas (deltaMode 0, small fractions).
// Windows external mice emit stepped LINE deltas (deltaMode 1, Firefox) or
// chunky pixel notches of ~100-120 per tick in pixel mode (Chrome/Edge).
// Without normalization one Windows notch teleports the view while Mac
// scrolling feels 1:1. Convert everything to pixels, then clamp a single
// tick so a notch can't jump erratically — trackpad fidelity is preserved
// because momentum arrives as many small events, not one big one.
const LINE_HEIGHT_PX = 16;
const MAX_TICK_PX = 150;

export function normalizeWheelDeltaY(e: WheelEvent): number {
  let dy = e.deltaY;
  if (e.deltaMode === 1) {
    dy *= LINE_HEIGHT_PX;
  } else if (e.deltaMode === 2) {
    dy *= typeof window !== "undefined" ? window.innerHeight : 800;
  }
  return Math.max(-MAX_TICK_PX, Math.min(MAX_TICK_PX, dy));
}

// Manual scroll hijack (same technique as the window/desktop drag code):
// required because nested scroll containers inside the R3F <Html> portal
// otherwise fight the 3D transform + canvas wheel handling.
export function useSmoothScroll(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      el.scrollTop += normalizeWheelDeltaY(e);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [ref]);
}
