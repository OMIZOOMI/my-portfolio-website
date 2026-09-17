"use client";

import React, { useEffect, useRef } from "react";
import { MenuBar } from "../webcam/MenuBar";
import { DesktopIcon } from "./DesktopIcon";
import Dock from "../dock/Dock";
import { WindowManager } from "../window-manager/WindowManager";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useSystemStore, ACCENT_HEX } from "../window-manager/useSystemStore";
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

  // Publish the system accent as a global CSS variable so any component can
  // theme primary highlights off it via var(--system-accent).
  useEffect(() => {
    document.documentElement.style.setProperty("--system-accent", ACCENT_HEX[accent]);
  }, [accent]);

  const visibleDesktopIds = desktopIds.filter((id) => !trashItems.includes(id) && !deletedIds.includes(id));

  return (
    <div
      id="desktop-root"
      ref={desktopRef}
      className="w-full h-full relative overflow-hidden select-none bg-cover bg-center transition-all duration-500"
      style={{ backgroundImage: `url("${wallpaper}")` }}
    >
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
