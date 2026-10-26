"use client";

import React, { useEffect, useRef } from "react";
import { MenuBar } from "../webcam/MenuBar";
import { DesktopIcon } from "./DesktopIcon";
import Dock from "../dock/Dock";
import { WindowManager } from "../window-manager/WindowManager";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useSystemStore, ACCENT_HEX, getWallpaperTheme } from "../window-manager/useSystemStore";
import { DragOverlay } from "./DragOverlay";
import { beginFilePointerDrag } from "./beginFilePointerDrag";
import { defaultDesktopPosition } from "./fileDrag";
import { GameMenu } from "../easter-egg/GameMenu";

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
  const [gameMenuOpen, setGameMenuOpen] = React.useState(false);
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
  const wallpaperTheme = getWallpaperTheme(wallpaper);
  const showDarkWallpaper = wallpaperMode === "dark" || (wallpaperMode === "auto" && isDarkMode);

  return (
    <div
      id="desktop-root"
      ref={desktopRef}
      className="w-full h-full relative isolate overflow-hidden select-none bg-cover bg-center"
      style={{ backgroundColor: "#1e1e1e" }}
    >
      {/* True dynamic wallpaper pair: both full-resolution assets are mounted
          together and their opacity crossfades when the requested mode changes. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-cover bg-center pointer-events-none transition-opacity duration-1000 ease-in-out"
        style={{ backgroundImage: `url("${wallpaperTheme.lightUrl}")`, opacity: showDarkWallpaper ? 0 : 1 }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-cover bg-center pointer-events-none transition-opacity duration-1000 ease-in-out"
        style={{ backgroundImage: `url("${wallpaperTheme.darkUrl}")`, opacity: showDarkWallpaper ? 1 : 0 }}
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
        onActivateGameMenu={() => setGameMenuOpen(true)}
      />
      <Dock />
      <DragOverlay />
      <GameMenu
        open={gameMenuOpen}
        onClose={() => setGameMenuOpen(false)}
        onLaunch={(id) => {
          setGameMenuOpen(false);
          useWindowStore.getState().openWindow({
            id: `game-${id}`,
            kind: "file-viewer",
            title: id === "block-rush" ? "Block Rush" : "Kingdom Siege",
          });
        }}
      />
    </div>
  );
}
