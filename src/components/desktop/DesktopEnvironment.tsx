"use client";

import React, { useEffect, useLayoutEffect, useRef } from "react";
import { MenuBar } from "../webcam/MenuBar";
import { getDesktopWorkArea } from "../window-manager/windowGeometry";
import { openPortfolioItem } from "./visitorLaunchers";
import { DesktopIcon } from "./DesktopIcon";
import Dock from "../dock/Dock";
import { WindowManager } from "../window-manager/WindowManager";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useSystemStore, ACCENT_HEX } from "../window-manager/useSystemStore";
import { WallpaperBackground } from "./WallpaperBackground";
import { DragOverlay } from "./DragOverlay";
import { beginFilePointerDrag } from "./beginFilePointerDrag";
import { defaultDesktopPosition } from "./fileDrag";
import { GameMenu } from "../easter-egg/GameMenu";
import { FileContextMenu } from "./FileContextMenu";
import { useFileInteractionStore } from "./useFileInteractionStore";
import { handleFileContextMenu, handleFileSurfaceKeyDown } from "./fileSurfaceEvents";
import { bindProjectedDesktopScroll } from "./projectedDesktopScroll";

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
  const handleOpen = () => openPortfolioItem({ id, name: label, type: variant });

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
      <DesktopIcon label={label} variant={variant} onOpen={handleOpen} itemId={id} surfaceId="desktop" onSelect={() => useFileInteractionStore.getState().selectItem("desktop", id)} />
    </div>
  );
}

export function DesktopEnvironment() {
  const desktopRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const desktop = desktopRef.current;
    if (desktop) return bindProjectedDesktopScroll(desktop);
  }, []);
  const [gameMenuOpen, setGameMenuOpen] = React.useState(false);
  const trashItems = useSystemStore((s) => s.trashItems);
  const deletedIds = useSystemStore((s) => s.deletedIds);
  const desktopIds = useSystemStore((s) => s.desktopIds);
  const desktopPositions = useSystemStore((s) => s.desktopPositions);
  const getFileItem = useSystemStore((s) => s.getFileItem);
  const fileSystem = useSystemStore((s) => s.fileSystem);
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

  // Own this measurement here: the desktop host ref is attached before its
  // owner layout effect; a descendant layout effect can see a null parent ref.
  useLayoutEffect(() => {
    const desktop = desktopRef.current;
    if (!desktop) return;
    const menu = desktop.querySelector<HTMLElement>("nav");
    const dock = desktop.querySelector<HTMLElement>("[data-dock]");
    const measure = () => {
      if (!desktop.clientWidth || !desktop.clientHeight) return;
      const size = { width: desktop.clientWidth, height: desktop.clientHeight };
      const top = menu ? menu.offsetTop + menu.offsetHeight : 0;
      // Maximize clears the dock; dragging and restoring use the actual screen
      // bounds behind it. Menu chrome keeps title-bar controls reachable.
      useWindowStore.getState().setDesktopWorkArea(
        getDesktopWorkArea(size, { top, bottom: dock ? desktop.clientHeight - dock.offsetTop : 0 }),
        getDesktopWorkArea(size, { top }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of [desktop, menu, dock]) if (element) observer.observe(element);
    globalThis.addEventListener("resize", measure);
    return () => { observer.disconnect(); globalThis.removeEventListener("resize", measure); };
  }, []);

  const visibleDesktopIds = desktopIds.filter((id) => !trashItems.includes(id) && !deletedIds.includes(id));

  return (
    <div
      id="desktop-root"
      data-file-surface="desktop"
      ref={desktopRef}
      tabIndex={0}
      aria-label="Portfolio desktop"
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("[data-window-frame], [data-dock], nav, [data-file-context-menu]")) return;
        if (useWindowStore.getState().focusedWindowId) useWindowStore.setState({ focusedWindowId: null });
        if (!target.closest("[data-file-item]")) {
          useFileInteractionStore.getState().selectItem("desktop", null);
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest("[data-window-frame], [data-dock], nav, [data-file-context-menu]")) return;
        handleFileContextMenu(event, "desktop", "desktop");
      }}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-window-frame], [data-dock], nav, [data-file-context-menu]")) return;
        handleFileSurfaceKeyDown(event, "desktop", "desktop");
      }}
      className="w-full h-full relative isolate overflow-clip select-none bg-cover bg-center"
      style={{ backgroundColor: "#1e1e1e" }}
    >
      <WallpaperBackground />
      <MenuBar />

      {visibleDesktopIds.map((id, index) => {
        const item = fileSystem.desktop?.find((file) => file.id === id) ?? getFileItem(id) ?? { id, name: id, type: "folder" as const };
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
      <FileContextMenu />
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
