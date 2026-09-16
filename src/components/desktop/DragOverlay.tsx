"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSystemStore } from "../window-manager/useSystemStore";
import FolderIconImg from "../../assets/FolderIcon.png";

const TRASH_PAD_PX = 40;

function isOverTrashAt(x: number, y: number): boolean {
  if (typeof document === "undefined") return false;
  const bin = document.getElementById("trash-bin");
  if (!bin) return false;
  const r = bin.getBoundingClientRect();
  return (
    x >= r.left - TRASH_PAD_PX &&
    x <= r.right + TRASH_PAD_PX &&
    y >= r.top - TRASH_PAD_PX &&
    y <= r.bottom + TRASH_PAD_PX
  );
}

/**
 * Custom global drag ghost, portaled to document.body so it lives completely
 * outside the R3F <Html transform> CSS-3D hierarchy (overflow:hidden +
 * matrix3d ancestors) that traps the browser's native HTML5 drag image.
 *
 * Sources are POINTER-based (no native draggable): on pointermove past a small
 * threshold they publish clientX/Y into useSystemStore.activeDrag and this
 * overlay follows in flat 2D screen space. pointer-events:none everywhere so
 * it can never swallow the pointerup that ends the gesture (and
 * elementFromPoint hit-testing sees straight through it).
 *
 * Also owns every cursor failsafe: pointermove coords + pointerup/pointercancel/
 * blur/Escape/visibilitychange all funnel into endDrag(), which clears the
 * `is-finder-dragging` (grabbing) body class. Redundant by design — no single
 * missed event can lock the cursor.
 */
export function DragOverlay() {
  const activeDrag = useSystemStore((s) => s.activeDrag);
  // Client-only gate for the body portal (SSR renders null). useSyncExternalStore
  // avoids setState-in-effect while staying hydration-safe.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Keep the grabbing cursor in sync even if a source unmounts mid-drag.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (activeDrag) {
      document.body.classList.add("is-finder-dragging");
    } else {
      document.body.classList.remove("is-finder-dragging");
    }
  }, [activeDrag]);

  useEffect(() => {
    // Pointer moves fire continuously during a custom drag (unlike native
    // dragover, which the 3D canvas swallows). Capture phase so nothing can
    // starve the ghost of coordinates.
    const onPointerMove = (e: PointerEvent) => {
      const st = useSystemStore.getState();
      if (!st.activeDrag) return;
      st.updateDragPos(e.clientX, e.clientY);
      st.setOverTrash(isOverTrashAt(e.clientX, e.clientY));
    };
    // Safety net: a real file dragged in from the OS must never navigate.
    const onDrop = (e: DragEvent) => {
      if (!useSystemStore.getState().activeDrag) return;
      e.preventDefault();
    };
    const end = () => useSystemStore.getState().endDrag();
    const onPointerUp = () => {
      // Sources resolve the drop themselves on pointerup; this is purely the
      // failsafe for gestures whose source unmounted mid-flight.
      if (useSystemStore.getState().activeDrag) {
        // Give the source handler (registered on window too) a tick to run
        // its hit-test first; endDrag is idempotent either way.
        globalThis.setTimeout(() => useSystemStore.getState().endDrag(), 0);
      }
    };
    const onBlur = () => useSystemStore.getState().endDrag();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") useSystemStore.getState().endDrag();
    };
    const onVisibility = () => {
      if (document.hidden) useSystemStore.getState().endDrag();
    };

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("drop", onDrop);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", end, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", end, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    return () => {
      useSystemStore.getState().endDrag();
    };
  }, []);

  if (!mounted || !activeDrag || typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none select-none"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        transform: `translate3d(${activeDrag.x}px, ${activeDrag.y}px, 0) translate(-50%, -55%) scale(1.03)`,
        zIndex: 2147483647,
        opacity: 0.95,
        filter: "drop-shadow(0 12px 20px rgba(0,0,0,0.45))",
        willChange: "transform",
      }}
    >
      <div className="pointer-events-none flex flex-col items-center gap-1.5 w-[84px] p-2">
        {activeDrag.type === "folder" && (
          <img
            src={FolderIconImg.src}
            alt=""
            draggable={false}
            className="pointer-events-none select-none"
            style={{ width: "56px", height: "56px", objectFit: "contain" }}
          />
        )}
        {activeDrag.type === "file" && (
          <svg viewBox="0 0 48 56" width="42" height="49" aria-hidden="true" className="pointer-events-none">
            <path d="M4 4h28l12 12v36a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z" fill="#e8e9ec" />
            <path d="M32 4v12h12L32 4Z" fill="#c7c9ce" />
            <rect x="10" y="26" width="22" height="2.5" rx="1.25" fill="#a9abb1" />
            <rect x="10" y="33" width="22" height="2.5" rx="1.25" fill="#a9abb1" />
            <rect x="10" y="40" width="14" height="2.5" rx="1.25" fill="#a9abb1" />
          </svg>
        )}
        {activeDrag.type === "app" && (
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
          {activeDrag.name}
        </span>
      </div>
    </div>,
    document.body
  );
}
