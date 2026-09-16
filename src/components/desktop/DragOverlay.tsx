"use client";

import { useEffect } from "react";
import { useSystemStore } from "../window-manager/useSystemStore";
import { clientToDesktopLocal } from "./fileDrag";
import FolderIconImg from "../../assets/FolderIcon.png";

/**
 * Single owner of window-level pointer tracking for file drags.
 * Ghost lives at the DesktopEnvironment root (inside the laptop Html
 * transform) so it shares the screen's 3D scale and is never clipped by
 * Finder overflow. pointer-events:none so hit-testing uses bounding rects.
 */
export function DragOverlay() {
  const isDragging = useSystemStore((s) => s.isDragging);
  const draggedItem = useSystemStore((s) => s.draggedItem);
  const dragPosition = useSystemStore((s) => s.dragPosition);
  const dragGrabOffset = useSystemStore((s) => s.dragGrabOffset);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const st = useSystemStore.getState();
      if (!st.isDragging && !st.pendingDrag) return;
      st.onDragPointerMove(e.clientX, e.clientY);
    };
    const onPointerUp = (e: PointerEvent) => {
      const st = useSystemStore.getState();
      if (!st.isDragging && !st.pendingDrag) return;
      st.onDragPointerUp(e.clientX, e.clientY);
    };
    const onPointerCancel = () => {
      useSystemStore.getState().onDragPointerCancel();
    };
    const onBlur = () => useSystemStore.getState().endDrag();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") useSystemStore.getState().endDrag();
    };
    const onVisibility = () => {
      if (document.hidden) useSystemStore.getState().endDrag();
    };
    const onNativeDrop = (e: DragEvent) => {
      if (!useSystemStore.getState().isDragging) return;
      e.preventDefault();
    };

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("drop", onNativeDrop);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("drop", onNativeDrop);
      document.removeEventListener("visibilitychange", onVisibility);
      useSystemStore.getState().endDrag();
    };
  }, []);

  if (!isDragging || !draggedItem) return null;

  const local = clientToDesktopLocal(dragPosition.x, dragPosition.y);
  const x = (local?.x ?? dragPosition.x) - dragGrabOffset.x;
  const y = (local?.y ?? dragPosition.y) - dragGrabOffset.y;

  return (
    <div
      aria-hidden="true"
      data-finder-ghost="true"
      className="pointer-events-none select-none"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: `translate3d(${x}px, ${y}px, 0)`,
        zIndex: 9999,
        opacity: 0.95,
        filter: "drop-shadow(0 12px 20px rgba(0,0,0,0.45))",
        willChange: "transform",
      }}
    >
      <div className="pointer-events-none flex flex-col items-center gap-1.5 w-[84px] p-2">
        {draggedItem.iconType === "folder" && (
          <img
            src={FolderIconImg.src}
            alt=""
            draggable={false}
            className="pointer-events-none select-none"
            style={{ width: "56px", height: "56px", objectFit: "contain" }}
          />
        )}
        {draggedItem.iconType === "file" && (
          <svg viewBox="0 0 48 56" width="42" height="49" aria-hidden="true" className="pointer-events-none">
            <path d="M4 4h28l12 12v36a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z" fill="#e8e9ec" />
            <path d="M32 4v12h12L32 4Z" fill="#c7c9ce" />
            <rect x="10" y="26" width="22" height="2.5" rx="1.25" fill="#a9abb1" />
            <rect x="10" y="33" width="22" height="2.5" rx="1.25" fill="#a9abb1" />
            <rect x="10" y="40" width="14" height="2.5" rx="1.25" fill="#a9abb1" />
          </svg>
        )}
        {draggedItem.iconType === "app" && (
          <div
            className="pointer-events-none"
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "13px",
              background: "linear-gradient(160deg, #4c8dff, #4c8dffCC)",
              boxShadow: "0 6px 14px rgba(0,0,0,0.35)",
            }}
          />
        )}
        <span
          className="pointer-events-none"
          style={{
            color: "#fff",
            fontSize: "12px",
            fontWeight: 500,
            textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            background: "rgba(60,60,67,0.9)",
            padding: "2px 6px",
            borderRadius: "4px",
            maxWidth: "84px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {draggedItem.name}
        </span>
      </div>
    </div>
  );
}
