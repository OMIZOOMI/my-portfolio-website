"use client";

import React, { useEffect, useRef } from "react";
import { MenuBar } from "../webcam/MenuBar";
import { DesktopIcon } from "./DesktopIcon";
import Dock from "../dock/Dock";
import { WindowManager } from "../window-manager/WindowManager";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useSystemStore, ACCENT_HEX, resolveWallpaper } from "../window-manager/useSystemStore";
import { DragOverlay } from "./DragOverlay";
import { beginFilePointerDrag } from "./beginFilePointerDrag";
import { defaultDesktopPosition } from "./fileDrag";

function DraggableDesktopItem({
  id,
  label,
  variant,
  x,
  y,
  isDragging,
}: {
  id: string;
  label: string;
  variant: "folder" | "file" | "app";
  x: number;
  y: number;
  isDragging: boolean;
}) {
  const handleOpen = () => {
    if (variant === "folder") {
      useWindowStore.getState().openWindow({ id: `finder-${id}`, kind: "finder", title: label });
    } else {
      useWindowStore.getState().openWindow({
        id: `file-${id}`,
        kind: "file-viewer",
        title: label,
      });
    }
  };

  return (
    <div
      data-file-item={id}
      data-drop-folder-id={variant === "folder" ? id : undefined}
      onPointerDown={(e) =>
        beginFilePointerDrag(e, {
          id,
          name: label,
          iconType: variant,
          source: "desktop",
          sourceFolderId: "desktop",
        })
      }
      className={`absolute cursor-grab select-none touch-none ${
        isDragging ? "opacity-40 scale-[0.97] saturate-50" : "opacity-100"
      }`}
      style={{ left: x, top: y, zIndex: isDragging ? 2 : 1 }}
    >
      <DesktopIcon label={label} variant={variant} onOpen={handleOpen} />
    </div>
  );
}

export function DesktopEnvironment() {
  const desktopRef = useRef<HTMLDivElement>(null);
  const wallpaper = useSystemStore((s) => s.wallpaper);
  const trashItems = useSystemStore((s) => s.trashItems);
  const deletedIds = useSystemStore((s) => s.deletedIds);
  const desktopIds = useSystemStore((s) => s.desktopIds);
  const desktopPositions = useSystemStore((s) => s.desktopPositions);
  const getFileItem = useSystemStore((s) => s.getFileItem);
  const activeDragId = useSystemStore((s) => s.draggedItem?.id ?? null);
  const accent = useSystemStore((s) => s.accent);
  const theme = useSystemStore((s) => s.theme);
  const isDarkMode = theme === "dark";

  // Publish the system accent as a global CSS variable so any component can
  // theme primary highlights off it via var(--system-accent).
  useEffect(() => {
    document.documentElement.style.setProperty("--system-accent", ACCENT_HEX[accent]);
  }, [accent]);

  // Class-driven color scheme: Tailwind `dark:` variants key off `.dark`.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  const visibleDesktopIds = desktopIds.filter((id) => !trashItems.includes(id) && !deletedIds.includes(id));
  const nextBackgroundUrl = resolveWallpaper(wallpaper, isDarkMode);

  // Preloaded swap: keep the CURRENT wallpaper painted until the next one has
  // fully decoded. Swapping backgroundImage directly flashes the fallback
  // color (near-black) on slow networks and leaves a black screen forever
  // when a URL 404s — the old image is retained instead.
  const [backgroundUrl, setBackgroundUrl] = React.useState(nextBackgroundUrl);
  useEffect(() => {
    if (nextBackgroundUrl === backgroundUrl) return;
    let cancelled = false;
    const img = new Image();
    img.src = nextBackgroundUrl;
    img.onload = () => {
      if (!cancelled) setBackgroundUrl(nextBackgroundUrl);
    };
    // On error: keep the old wallpaper rather than going black.
    return () => {
      cancelled = true;
    };
  }, [nextBackgroundUrl, backgroundUrl]);

  return (
    <div
      id="desktop-root"
      ref={desktopRef}
      className="w-full h-full relative overflow-hidden select-none bg-cover bg-center"
      style={{ backgroundColor: "#1e1e1e" }}
    >
      {/* Dedicated wallpaper layer pinned behind everything in this stacking
          context. Windows/MenuBar/Dock paint above it by DOM order + z-index,
          so no overlay or backdrop can ever obscure it into black. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center pointer-events-none"
        style={{ backgroundImage: `url("${backgroundUrl}")` }}
      />
      <MenuBar />

      {visibleDesktopIds.map((id, index) => {
        const item = getFileItem(id) ?? { id, name: id, type: "folder" as const };
        const pos = desktopPositions[id] ?? defaultDesktopPosition(index);
        return (
          <DraggableDesktopItem
            key={id}
            id={id}
            label={item.name}
            variant={item.type}
            x={pos.x}
            y={pos.y}
            isDragging={activeDragId === id}
          />
        );
      })}

      <WindowManager
        dragConstraintsRef={desktopRef as React.RefObject<HTMLDivElement>}
        onActivateGameMenu={() => console.log("Game menu activated!")}
      />
      <Dock />
      <DragOverlay />
    </div>
  );
}
