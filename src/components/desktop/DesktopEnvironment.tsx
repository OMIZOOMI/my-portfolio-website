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
  const wallpaperMode = useSystemStore((s) => s.wallpaperMode);
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
  const nextBackgroundUrl = resolveWallpaper(wallpaper, wallpaperMode, isDarkMode);

  // Preloaded crossfade: keep the CURRENT wallpaper painted until the next
  // one has fully decoded, then fade between them over 1s instead of an
  // instantaneous swap. Failed loads retain the old image — never black.
  const [wall, setWall] = React.useState({
    shown: nextBackgroundUrl,
    incoming: null as string | null,
    fading: false,
  });
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (nextBackgroundUrl === wall.shown || nextBackgroundUrl === wall.incoming) return;
    let cancelled = false;
    const img = new Image();
    img.src = nextBackgroundUrl;
    img.onload = () => {
      if (cancelled) return;
      // New image paints beneath; old fades out on top over 1s.
      setWall({ shown: wall.shown, incoming: nextBackgroundUrl, fading: true });
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(() => {
        setWall({ shown: nextBackgroundUrl, incoming: null, fading: false });
      }, 1000);
    };
    // On error: keep the old wallpaper rather than going black.
    return () => {
      cancelled = true;
      if (fadeTimer.current) {
        clearTimeout(fadeTimer.current);
        fadeTimer.current = null;
      }
    };
  }, [nextBackgroundUrl, wall.shown, wall.incoming]);
  useEffect(() => {
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, []);

  return (
    <div
      id="desktop-root"
      ref={desktopRef}
      className="w-full h-full relative overflow-hidden select-none bg-cover bg-center"
      style={{ backgroundColor: "#1e1e1e" }}
    >
      {/* Dedicated wallpaper layers pinned behind everything in this stacking
          context. Windows/MenuBar/Dock paint above them by DOM order + z-index,
          so no overlay or backdrop can ever obscure them into black. The top
          layer crossfades out over 1s whenever the theme changes. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center pointer-events-none"
        style={{ backgroundImage: `url("${wall.incoming ?? wall.shown}")` }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center pointer-events-none transition-opacity duration-1000 ease-in-out"
        style={{ backgroundImage: `url("${wall.shown}")`, opacity: wall.fading ? 0 : 1 }}
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
