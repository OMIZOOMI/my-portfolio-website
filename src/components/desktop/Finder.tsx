"use client";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useSystemStore } from "../window-manager/useSystemStore";
import React, { useState, useEffect, useRef } from "react";
import { DesktopIcon } from "./DesktopIcon";
import { FILE_SYSTEM } from "../../data/fileSystem";
import type { FileItem } from "../../data/fileSystem";

function lookupFileItem(id: string) {
  for (const folder in FILE_SYSTEM) {
    const found = FILE_SYSTEM[folder].find((file) => file.id === id);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Custom pointer drag (no native draggable={true}).
//
// The whole desktop renders inside an R3F <Html transform> CSS-3D context, so
// native HTML5 dragstart/dragover either never fire or get trapped by 3D
// pointer bounds. Instead we track window pointermove/up directly in physical
// clientX/Y pixels — the same technique as the desktop/window drag code —
// publish the session to useSystemStore.activeDrag (rendered by DragOverlay,
// portaled to document.body), and resolve the drop by coordinates.
// ---------------------------------------------------------------------------
const DRAG_THRESHOLD_PX = 6;
const TRASH_PAD_PX = 40;

function isOverTrashAt(x: number, y: number): boolean {
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

function resolveDropTarget(x: number, y: number): "trash" | "desktop" | "none" {
  if (isOverTrashAt(x, y)) return "trash";
  // The overlay ghost is pointer-events:none so it never shows up here.
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return "none";
  // Dropped back inside any window (including this Finder) or on the dock:
  // cancel, the file stays where it was.
  if (el.closest?.("[data-window-frame]")) return "none";
  if (el.closest?.("[data-dock]")) return "none";
  return "desktop";
}

interface FinderDragItemProps {
  item: FileItem;
  fromFolder: string;
  isDragging: boolean;
  isHidden: (id: string) => boolean;
  navigateTo: (folderId: string) => void;
}

function FinderDragItem({ item, fromFolder, isDragging, isHidden, navigateTo }: FinderDragItemProps) {
  const pending = useRef<{ startX: number; startY: number; live: boolean } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    pending.current = { startX: e.clientX, startY: e.clientY, live: false };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      pending.current = null;
    };
    const onMove = (ev: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!p.live) {
        if (Math.hypot(ev.clientX - p.startX, ev.clientY - p.startY) < DRAG_THRESHOLD_PX) return;
        p.live = true;
        useSystemStore.getState().startDrag({
          id: item.id,
          name: item.name,
          type: item.type,
          fromFolder,
          x: ev.clientX,
          y: ev.clientY,
        });
      }
      const st = useSystemStore.getState();
      st.updateDragPos(ev.clientX, ev.clientY);
      st.setOverTrash(isOverTrashAt(ev.clientX, ev.clientY));
    };
    const onUp = (ev: PointerEvent) => {
      const wasLive = pending.current?.live ?? false;
      cleanup();
      if (!wasLive) return; // plain click — let click/double-click through
      const st = useSystemStore.getState();
      if (!st.activeDrag) return; // session already cancelled (blur/Escape)
      const target = resolveDropTarget(ev.clientX, ev.clientY);
      if (target === "trash") st.addToTrash(item.id);
      else if (target === "desktop") st.moveToDesktop(item.id);
      st.endDrag();
    };
    const onCancel = () => {
      cleanup();
      useSystemStore.getState().endDrag();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      className={`cursor-grab active:cursor-grabbing select-none transition-opacity duration-150 ${
        isDragging ? "opacity-40 scale-[0.97] saturate-50" : "opacity-100"
      }`}
    >
      <DesktopIcon
        label={item.name}
        variant={item.type}
        onOpen={() => {
          if (isHidden(item.id)) return;
          if (item.type === "folder") {
            navigateTo(item.id);
          } else {
            useWindowStore.getState().openWindow({
              id: `file-${item.id}`,
              kind: "file-viewer",
              title: item.name
            });
          }
        }}
      />
    </div>
  );
}

export function Finder({ window }: { window: { id: string; title: string } }) {
  const startFolder = window?.title?.toLowerCase().replace(" ", "-") || "desktop";

  const [history, setHistory] = useState<string[]>([FILE_SYSTEM[startFolder] ? startFolder : "desktop"]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Pickup feedback reads the GLOBAL session so any failsafe reset
  // (pointerup/blur/Escape in DragOverlay) also clears the fade — a local-only
  // flag is what used to get stuck. Selector returns just the id, so x/y
  // overlay ticks don't re-render the grid.
  const activeDragId = useSystemStore((s) => s.activeDrag?.id ?? null);

  const currentFolderId = history[currentIndex];

  // Filter out trashed + permanently deleted items everywhere.
  // Desktop folder view is driven by desktopIds so Finder<->Desktop moves stay in sync.
  const { trashItems, deletedIds, desktopIds } = useSystemStore();

  const isHidden = (id: string) => trashItems.includes(id) || deletedIds.includes(id);

  // If this window was already open inside a folder that just got trashed /
  // deleted, block the orphaned view instead of showing stale children.
  // (Recursive addToTrash already hides the children; this covers the parent.)
  const isCurrentFolderTrashed = trashItems.includes(currentFolderId);
  const isCurrentFolderDeleted = deletedIds.includes(currentFolderId);
  const isCurrentFolderGone = isCurrentFolderTrashed || isCurrentFolderDeleted;

  const items = React.useMemo(() => {
    if (isCurrentFolderGone) return [];
    if (currentFolderId === "desktop") {
      return desktopIds
        .map((id) => lookupFileItem(id) ?? { id, name: id, type: "folder" as const })
        .filter((item) => !isHidden(item.id));
    }
    return (FILE_SYSTEM[currentFolderId] || []).filter(
      (item) => !isHidden(item.id) && !desktopIds.includes(item.id)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId, isCurrentFolderGone, trashItems, deletedIds, desktopIds]);

  useEffect(() => {
    if (window?.id) {
      const formattedTitle = currentFolderId
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      useWindowStore.setState((state) => {
        if (!state.windows[window.id]) return state;
        return {
          windows: {
            ...state.windows,
            [window.id]: {
              ...state.windows[window.id],
              title: formattedTitle
            }
          }
        };
      });
    }
  }, [currentFolderId, window?.id]);

  const navigateTo = (folderId: string) => {
    if (!FILE_SYSTEM[folderId]) return;
    // Never navigate into a trashed / deleted folder.
    if (trashItems.includes(folderId) || deletedIds.includes(folderId)) return;
    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push(folderId);
    setHistory(newHistory);
    setCurrentIndex(currentIndex + 1);
  };

  return (
    <div className="flex w-full h-full bg-[#1e1e1e]/90 text-gray-200 select-none font-sans flex-row">
      <div className="w-44 bg-black/30 border-r border-white/10 p-3 flex flex-col gap-1">
        <h3 className="text-[11px] font-bold text-gray-400 mb-1 px-2 uppercase tracking-wider">Favorites</h3>
        <button
          onClick={() => navigateTo("desktop")}
          className={`text-left text-sm px-3 py-1.5 rounded-md transition-colors ${currentFolderId === "desktop" ? "bg-blue-500/80 text-white" : "hover:bg-white/10"}`}
        >
          Desktop
        </button>
        <button
          onClick={() => navigateTo("documents")}
          className={`text-left text-sm px-3 py-1.5 rounded-md transition-colors ${currentFolderId === "documents" ? "bg-blue-500/80 text-white" : "hover:bg-white/10"}`}
        >
          Documents
        </button>
      </div>

      <div className="flex-1 flex flex-col bg-[#1e1e1e]">
        <div className="h-12 border-b border-white/10 flex items-center px-4 gap-4 bg-white/5">
          <div className="flex gap-2">
            <button onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0} className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 disabled:opacity-30">
              {"<"}
            </button>
            <button onClick={() => setCurrentIndex(Math.min(history.length - 1, currentIndex + 1))} disabled={currentIndex === history.length - 1} className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 disabled:opacity-30">
              {">"}
            </button>
          </div>
          <div className="text-sm font-semibold capitalize text-gray-300">
            {currentFolderId.replace("-", " ")}
          </div>
        </div>

        <div className="flex-1 p-6 flex flex-wrap gap-8 content-start overflow-y-auto">
        {isCurrentFolderGone ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center gap-3 py-16">
            <div className="text-4xl">{isCurrentFolderDeleted ? "🗑️" : "🚫"}</div>
            <p className="text-sm font-semibold text-gray-200">
              {isCurrentFolderDeleted
                ? "This folder was permanently deleted."
                : "This folder was moved to the Bin."}
            </p>
            <p className="text-xs text-gray-500">
              {isCurrentFolderDeleted
                ? "Emptying the Bin cannot be undone."
                : "Its contents were moved with it."}
            </p>
            <button
              onClick={() => navigateTo("desktop")}
              className="mt-2 px-4 py-1.5 text-sm bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-md transition-colors"
            >
              Go to Desktop
            </button>
          </div>
        ) : items.map((item) => (
            <FinderDragItem
              key={item.id}
              item={item}
              fromFolder={currentFolderId}
              isDragging={activeDragId === item.id}
              isHidden={isHidden}
              navigateTo={navigateTo}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
