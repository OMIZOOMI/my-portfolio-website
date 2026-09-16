"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useSystemStore } from "../window-manager/useSystemStore";
import { clientToDesktopLocal, type DraggedItem } from "./fileDrag";

export function beginFilePointerDrag(e: ReactPointerEvent, item: DraggedItem) {
  if (e.button !== 0) return;
  e.stopPropagation();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const grab = clientToDesktopLocal(e.clientX, e.clientY);
  const corner = clientToDesktopLocal(rect.left, rect.top);
  useSystemStore.getState().beginPointerDrag({
    item,
    position: { x: e.clientX, y: e.clientY },
    grabOffset:
      grab && corner
        ? { x: grab.x - corner.x, y: grab.y - corner.y }
        : { x: e.clientX - rect.left, y: e.clientY - rect.top },
    pointerId: e.pointerId,
  });
}
