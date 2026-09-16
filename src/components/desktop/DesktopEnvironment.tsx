"use client";

import React, { useRef, useState } from "react";
import { motion, useMotionValue } from "framer-motion";
import { MenuBar } from "../webcam/MenuBar";
import { DesktopIcon } from "./DesktopIcon";
import Dock from "../dock/Dock";
import { WindowManager } from "../window-manager/WindowManager";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useSystemStore } from "../window-manager/useSystemStore";
import { FILE_SYSTEM } from "../../data/fileSystem";
import { DragOverlay } from "./DragOverlay";

function lookupDesktopItem(id: string) {
  for (const folder in FILE_SYSTEM) {
    const found = FILE_SYSTEM[folder].find((file) => file.id === id);
    if (found) return found;
  }
  return { id, name: id, type: "folder" as const };
}

// The ultimate custom drag logic that completely eliminates 3D scaling lag
const DraggableFolder = ({ id, label, variant, onOpen, addToTrash }: { id: string, label: string, variant: "folder" | "file" | "app", onOpen: () => void, addToTrash: (id: string) => void }) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const el = e.currentTarget as HTMLElement;
    // Calculate the exact 3D visual scale ratio to fix mouse lag
    const rect = el.getBoundingClientRect();
    const scale = rect.width / el.offsetWidth || 1;

    let lastX = e.clientX;
    let lastY = e.clientY;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - lastX;
      const deltaY = moveEvent.clientY - lastY;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      x.set(x.get() + deltaX / scale);
      y.set(y.get() + deltaY / scale);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      setIsDragging(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      // 1:1 Physical collision detection for the Trash Bin
      const trashBin = document.getElementById("trash-bin");
      if (trashBin) {
        const trashRect = trashBin.getBoundingClientRect();
        if (
          upEvent.clientX >= trashRect.left - 40 &&
          upEvent.clientX <= trashRect.right + 40 &&
          upEvent.clientY >= trashRect.top - 40 &&
          upEvent.clientY <= trashRect.bottom + 40
        ) {
          addToTrash(id);
        }
      }
      
      // Snap back to grid if missed
      x.set(0);
      y.set(0);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <motion.div
      style={{ x, y, zIndex: isDragging ? 9999 : 1, position: "relative", cursor: isDragging ? "grabbing" : "grab" }}
      animate={{ scale: isDragging ? 1.05 : 1, opacity: isDragging ? 0.8 : 1 }}
      onPointerDown={handlePointerDown}
      className="cursor-grab active:cursor-grabbing"
    >
      <DesktopIcon label={label} variant={variant} onOpen={onOpen} />
    </motion.div>
  );
};

export function DesktopEnvironment() {
  const desktopRef = useRef<HTMLDivElement>(null);
  const { wallpaper, trashItems, deletedIds, desktopIds, addToTrash } = useSystemStore();

  const visibleDesktopIds = desktopIds.filter(
    (id) => !trashItems.includes(id) && !deletedIds.includes(id)
  );

  const handleOpenDesktopItem = (id: string) => {
    const item = lookupDesktopItem(id);
    if (item.type === "folder") {
      useWindowStore.getState().openWindow({ id: `finder-${id}`, kind: "finder", title: item.name });
    } else {
      useWindowStore.getState().openWindow({
        id: `file-${item.id}`,
        kind: "file-viewer",
        title: item.name,
      });
    }
  };

  return (
    <div
      ref={desktopRef}
      className="w-full h-full relative overflow-hidden select-none bg-cover bg-center transition-all duration-500"
      style={{ backgroundImage: `url("${wallpaper}")` }}
    >
      <MenuBar />
      
      {/* Desktop Folders Grid — driven by desktopIds so Finder moves + trash stay in sync */}
      <div className="absolute top-10 right-4 flex flex-col gap-4 items-center z-10 p-2">
        {visibleDesktopIds.map((id) => {
          const item = lookupDesktopItem(id);
          return (
            <DraggableFolder
              key={id}
              id={id}
              label={item.name}
              variant={item.type}
              addToTrash={addToTrash}
              onOpen={() => handleOpenDesktopItem(id)}
            />
          );
        })}
      </div>

      <WindowManager dragConstraintsRef={desktopRef as React.RefObject<HTMLDivElement>} onActivateGameMenu={() => console.log("Game menu activated!")} />
      <Dock />
      {/* Body-portaled in DragOverlay: renders outside the R3F <Html> CSS-3D
          context so the ghost can't be clipped by 3D boundaries. */}
      <DragOverlay />
    </div>
  );
}