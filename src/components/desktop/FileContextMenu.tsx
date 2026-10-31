"use client";

import { openPortfolioItem } from "./visitorLaunchers";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FolderOpen, FolderPlus, Pencil, RotateCcw, Trash2, SquareArrowOutUpRight } from "lucide-react";
import { useSystemStore } from "../window-manager/useSystemStore";
import { createFolderAndRename, useFileInteractionStore, type FileContextMenuState } from "./useFileInteractionStore";
import styles from "./FileContextMenu.module.css";
import { getDesktopCoordinateSpace } from "../window-manager/desktopCoordinates";

function PositionedFileMenu({ menu }: { menu: FileContextMenuState }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: menu.x, y: menu.y, width: 220, height: 400 });
  const fileSystem = useSystemStore((state) => state.fileSystem);
  const trashItems = useSystemStore((state) => state.trashItems);
  const deletedIds = useSystemStore((state) => state.deletedIds);
  const trashOrigins = useSystemStore((state) => state.trashOrigins);
  const files = useSystemStore.getState();
  const item = menu.itemId ? files.getFileItem(menu.itemId) : null;
  const hidden = !!item && (trashItems.includes(item.id) || deletedIds.includes(item.id) || files.isHidden(item.id));
  const inBin = menu.folderId === "bin" || !!item && trashItems.includes(item.id);
  const folderExists = menu.folderId === "desktop" || !!fileSystem[menu.folderId];
  const writable = folderExists && menu.folderId !== "bin" && !files.isHidden(menu.folderId);
  const canRename = !!item && item.type === "folder" && item.id !== "bin" && !hidden && !inBin;
  const newFolderShortcut = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⇧⌘N" : "Ctrl+Shift+N";
  // The origin map also changes after a restore; subscribe to it independently of pointer state.
  const canRestore = !!item && (trashOrigins[item.id] ?? item.id) === item.id && files.canRestoreFromTrash(item.id);

  useLayoutEffect(() => {
    const reposition = () => {
      const root = document.getElementById("desktop-root");
      const element = menuRef.current;
      if (!root || !element) return;
      const rect = root.getBoundingClientRect();
      const space = getDesktopCoordinateSpace(root);
      if (!space) return;
      const corners = [
        { x: Math.max(0, rect.left), y: Math.max(0, rect.top) },
        { x: Math.min(window.innerWidth, rect.right), y: Math.max(0, rect.top) },
        { x: Math.min(window.innerWidth, rect.right), y: Math.min(window.innerHeight, rect.bottom) },
        { x: Math.max(0, rect.left), y: Math.min(window.innerHeight, rect.bottom) },
      ].map(point => space.toLocal(point));
      if (corners.some(point => !point)) return;
      const [topLeft, topRight, bottomRight, bottomLeft] = corners as { x: number; y: number }[];
      const margin = 6;
      const left = Math.max(0, topLeft.x, bottomLeft.x) + margin;
      const top = Math.max(0, topLeft.y, topRight.y) + margin;
      const right = Math.min(root.clientWidth, topRight.x, bottomRight.x) - margin;
      const bottom = Math.min(root.clientHeight, bottomLeft.y, bottomRight.y) - margin;
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      const x = Math.max(left, Math.min(menu.x, right - Math.min(element.offsetWidth, width)));
      const y = Math.max(top, Math.min(menu.y, bottom - Math.min(element.offsetHeight, height)));
      setPosition((current) => current.x === x && current.y === y && current.width === width && current.height === height
        ? current : { x, y, width, height });
    };
    reposition();
    const root = document.getElementById("desktop-root");
    const observer = new ResizeObserver(reposition);
    if (root) observer.observe(root);
    if (menuRef.current) observer.observe(menuRef.current);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [menu.x, menu.y]);

  useLayoutEffect(() => {
    const first = menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    (first ?? menuRef.current)?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        useFileInteractionStore.getState().closeContextMenu();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      useFileInteractionStore.getState().closeContextMenu();
      menu.trigger?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [menu.trigger]);

  const action = (callback: () => void) => {
    useFileInteractionStore.getState().closeContextMenu();
    callback();
  };
  const open = (newWindow: boolean) => {
    if (!item || hidden || inBin) return;
    openPortfolioItem(item, { newWindow });
  };

  return <div ref={menuRef} role="menu" aria-label={item ? `${item.name} actions` : "Folder actions"}
    tabIndex={-1} data-file-context-menu className={styles.menu}
    style={{ left: position.x, top: position.y, maxWidth: position.width, maxHeight: position.height }}
    onPointerDown={(event) => event.stopPropagation()}
    onPointerUp={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Tab") { useFileInteractionStore.getState().closeContextMenu(); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (current + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}
  >
    {item && !inBin && <>
      <button type="button" role="menuitem" data-file-action="open" disabled={hidden} onClick={() => action(() => open(false))}><FolderOpen size={15} aria-hidden="true" /><span>Open</span></button>
      {item.type === "folder" && <button type="button" role="menuitem" data-file-action="open-new-window" disabled={hidden} onClick={() => action(() => open(true))}><SquareArrowOutUpRight size={15} aria-hidden="true" /><span>Open in New Window</span></button>}
      <div role="separator" className={styles.separator} />
      {item.type === "folder" && <button type="button" role="menuitem" data-file-action="rename" disabled={!canRename} onClick={() => action(() => useFileInteractionStore.getState().beginRename(menu.surfaceId, item.id))}><Pencil size={15} aria-hidden="true" /><span>Rename</span><kbd>F2</kbd></button>}
      <button type="button" role="menuitem" data-file-action="trash" disabled={hidden || item.id === "bin"} onClick={() => action(() => files.addToTrash(item.id))}><Trash2 size={15} aria-hidden="true" /><span>Move to Bin</span></button>
    </>}
    {item && inBin && <button type="button" role="menuitem" data-file-action="restore" disabled={!canRestore} title={!canRestore ? "Restore the containing folder first" : undefined} onClick={() => action(() => files.restoreFromTrash(item.id))}><RotateCcw size={15} aria-hidden="true" /><span>Put Back</span></button>}
    {!item && <button type="button" role="menuitem" data-file-action="new-folder" disabled={!writable} onClick={() => action(() => { createFolderAndRename(menu.surfaceId, menu.folderId); })}><FolderPlus size={15} aria-hidden="true" /><span>New Folder</span><kbd>{newFolderShortcut}</kbd></button>}
  </div>;
}

/** Mount once inside desktop-root, so coordinates stay in the projected desktop's space. */
export function FileContextMenu() {
  const menu = useFileInteractionStore((state) => state.contextMenu);
  return menu ? <PositionedFileMenu key={`${menu.surfaceId}:${menu.itemId}:${menu.x}:${menu.y}`} menu={menu} /> : null;
}
