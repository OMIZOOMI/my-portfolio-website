"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useSystemStore } from "../window-manager/useSystemStore";
import { clientToDesktopLocal, type DraggedItem } from "./fileDrag";
import { getDesktopCoordinateSpace } from "../window-manager/desktopCoordinates";

export function beginFilePointerDrag(e: ReactPointerEvent, item: DraggedItem) {
  if (e.button !== 0) return;
  if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable='true'], [data-file-rename-editor], [data-file-context-menu], [data-file-action]")) return;
  e.stopPropagation();
  // A projected bounding box combines different corners of a trapezoid. Read
  // this positioned item's true top-left through the same planar projection
  // used by the desktop, so grabbing a right-side icon cannot shift its origin.
  const origin = getDesktopCoordinateSpace(e.currentTarget as HTMLElement)?.toClient({ x: 0, y: 0 });
  const grab = clientToDesktopLocal(e.clientX, e.clientY);
  const corner = origin && clientToDesktopLocal(origin.x, origin.y);
  if (!grab || !corner) return;
  useSystemStore.getState().beginPointerDrag({
    item,
    position: { x: e.clientX, y: e.clientY },
    grabOffset: { x: grab.x - corner.x, y: grab.y - corner.y },
    pointerId: e.pointerId,
  });
}
