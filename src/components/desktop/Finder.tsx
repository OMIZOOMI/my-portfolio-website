"use client";

import { openPortfolioItem } from "./visitorLaunchers";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, FileText, Folder, FolderPlus, House, Monitor, PanelLeft, Pencil, Trash2 } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { useWindowStore, type WindowState } from "../window-manager/useWindowStore";
import { useSystemStore } from "../window-manager/useSystemStore";
import { DesktopIcon } from "./DesktopIcon";
import { beginFilePointerDrag } from "./beginFilePointerDrag";
import type { FileItem } from "../../data/fileSystem";
import styles from "./Finder.module.css";
import { createFolderAndRename, useFileInteractionStore } from "./useFileInteractionStore";
import { handleFileContextMenu, handleFileSurfaceKeyDown } from "./fileSurfaceEvents";

const LOCATIONS = [
  { id: "desktop", name: "Desktop", icon: Monitor },
  { id: "documents", name: "Documents", icon: FileText },
  { id: "projects", name: "Projects", icon: Folder },
];

function folderName(id: string, fileSystem: Record<string, FileItem[]>) {
  for (const children of Object.values(fileSystem)) {
    const item = children.find((child) => child.id === id);
    if (item) return item.name;
  }
  return id.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function folderPath(id: string, fileSystem: Record<string, FileItem[]>, desktopIds: string[]) {
  const path: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = id;
  while (current && !seen.has(current)) {
    seen.add(current);
    path.unshift(current);
    if (current === "desktop" || current === "documents" || current === "bin") break;
    const childId: string = current;
    current = desktopIds.includes(childId)
      ? "desktop"
      : Object.keys(fileSystem).find((parent) => fileSystem[parent].some((item) => item.id === childId));
  }
  return path;
}

interface FinderDragItemProps {
  item: FileItem;
  fromFolder: string;
  isDragging: boolean;
  isDropTarget: boolean;
  selected: boolean;
  onSelect: () => void;
  navigateTo: (folderId: string) => void;
  surfaceId: string;
}

function FinderDragItem({ item, fromFolder, isDragging, isDropTarget, selected, onSelect, navigateTo, surfaceId }: FinderDragItemProps) {
  return (
    <div
      role="listitem"
      data-file-item={item.id}
      data-drop-folder-id={item.type === "folder" ? item.id : undefined}
      data-dragging={isDragging || undefined}
      data-drop-target={isDropTarget || undefined}
      className={styles.item}
      onPointerDown={(e) => beginFilePointerDrag(e, {
        id: item.id,
        name: item.name,
        iconType: item.type,
        source: "finder",
        sourceFolderId: fromFolder,
      })}
    >
      <DesktopIcon
        label={item.name}
        variant={item.type}
        tone="window"
        layout="finder"
        selected={selected}
        onSelect={onSelect}
        itemId={item.id}
        surfaceId={surfaceId}
        onOpen={() => {
          if (fromFolder === "bin") {
            useSystemStore.getState().restoreFromTrash(item.id);
            return;
          }
          if (useSystemStore.getState().isHidden(item.id)) return;
          openPortfolioItem(item, { navigateFolder: navigateTo });
        }}
      />
    </div>
  );
}

export function Finder({ window }: { window: WindowState }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const fileSystem = useSystemStore((s) => s.fileSystem);
  const currentFolderId = window.folderId ?? (window.kind === "bin" ? "bin" : "desktop");
  const history = window.folderHistory ?? [currentFolderId];
  const currentIndex = window.folderHistoryIndex ?? 0;
  const selection = useFileInteractionStore((s) => s.selections[window.id] ?? null);
  // Deliberately exclude pointer coordinates and unrelated app preferences.
  const activeDragId = useSystemStore((s) => s.draggedItem?.id ?? null);
  const hoveredFolderId = useSystemStore((s) => s.dropTarget === "finder" ? s.dropFolderId : null);
  const isFileDragging = useSystemStore((s) => s.isDragging);
  const trashItems = useSystemStore((s) => s.trashItems);
  const trashOrigins = useSystemStore((s) => s.trashOrigins);
  const deletedIds = useSystemStore((s) => s.deletedIds);
  const desktopIds = useSystemStore((s) => s.desktopIds);
  const emptyTrash = useSystemStore((s) => s.emptyTrash);
  const sidebarVisible = useSystemStore((s) => s.finderSidebarVisible);
  const toggleSidebar = useSystemStore((s) => s.toggleFinderSidebar);
  const pathBarVisible = useSystemStore((s) => s.finderPathBarVisible);
  const statusBarVisible = useSystemStore((s) => s.finderStatusBarVisible);
  const reduceMotion = useSystemStore((s) => s.reduceMotion);
  const prefersReducedMotion = useReducedMotion();

  const isCurrentFolderMissing = !Object.hasOwn(fileSystem, currentFolderId);
  const currentTitle = isCurrentFolderMissing ? window.title : folderName(currentFolderId, fileSystem);
  const isCurrentFolderDeleted = deletedIds.includes(currentFolderId);
  const isCurrentFolderGone = isCurrentFolderDeleted || trashItems.includes(currentFolderId) || isCurrentFolderMissing;
  const isHidden = (id: string) => trashItems.includes(id) || deletedIds.includes(id);

  const items = useMemo(() => {
    if (isCurrentFolderGone) return [];
    const hidden = (id: string) => trashItems.includes(id) || deletedIds.includes(id);
    const getItem = useSystemStore.getState().getFileItem;
    if (currentFolderId === "bin") return trashItems.filter((id) => !trashOrigins[id] || trashOrigins[id] === id).map((id) => getItem(id) ?? { id, name: id, type: "file" as const });
    if (currentFolderId === "desktop") {
      return desktopIds.map((id) => getItem(id) ?? { id, name: id, type: "folder" as const }).filter((item) => !hidden(item.id));
    }
    return (fileSystem[currentFolderId] || []).filter((item) => !hidden(item.id) && !desktopIds.includes(item.id));
  }, [currentFolderId, isCurrentFolderGone, trashItems, trashOrigins, deletedIds, desktopIds, fileSystem]);

  useEffect(() => {
    useWindowStore.getState().setFinderLocation(window.id, currentFolderId, currentTitle);
  }, [currentTitle, currentFolderId, window.id]);

  useLayoutEffect(() => {
    // Opening a folder removes its icon; keep keyboard shortcuts in this window.
    if (!window.minimized && useWindowStore.getState().focusedWindowId === window.id) {
      contentRef.current?.focus({ preventScroll: true });
    }
  }, [currentFolderId, window.id, window.minimized]);

  const navigateTo = (folderId: string) => {
    if (folderId === currentFolderId || (!fileSystem[folderId] && folderId !== "desktop" && folderId !== "bin") || isHidden(folderId)) return;
    useWindowStore.getState().setFinderLocation(window.id, folderId, folderName(folderId, fileSystem));
  };
  const navigateHistory = (index: number) => {
    const id = history[index];
    if (id) useWindowStore.getState().setFinderLocation(window.id, id, folderName(id, fileSystem), index);
  };
  const path = folderPath(currentFolderId, fileSystem, desktopIds);
  const selectedItem = items.find((item) => item.id === selection);
  const trashRootCount = trashItems.filter((id) => !trashOrigins[id] || trashOrigins[id] === id).length;
  const canCreate = currentFolderId !== "bin" && !isCurrentFolderGone && !!fileSystem[currentFolderId];
  const canRename = currentFolderId !== "bin" && !isCurrentFolderGone && selectedItem?.type === "folder";
  const sidebarId = `${window.id}-sidebar`;
  const isDropTarget = (folderId: string) => isFileDragging && hoveredFolderId === folderId && activeDragId !== folderId;

  return (
    <div className={styles.finder} data-finder-root data-in-bin={currentFolderId === "bin" || undefined} data-reduced-motion={reduceMotion || prefersReducedMotion || undefined} onKeyDown={(event) => handleFileSurfaceKeyDown(event, window.id, currentFolderId)}>
      <div className={styles.layout}>
        {sidebarVisible && (
          <nav id={sidebarId} aria-label="Finder locations" className={styles.sidebar}>
            <div className={styles.group}>
              <h2 className={styles.groupTitle}>Favourites</h2>
              {LOCATIONS.filter((location) => (location.id === "desktop" || !!fileSystem[location.id]) && !isHidden(location.id)).map(({ id, name, icon: Icon }) => (
                <button key={id} type="button" data-finder-location={id} data-drop-folder-id={id} data-drop-target={isDropTarget(id) || undefined} aria-current={currentFolderId === id ? "page" : undefined} onClick={() => navigateTo(id)} className={styles.location}>
                  <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
                  <span>{id === "projects" ? folderName(id, fileSystem) : name}</span>
                </button>
              ))}
            </div>
            <div className={styles.group}>
              <h2 className={styles.groupTitle}>Locations</h2>
              <button type="button" data-finder-location="bin" data-drop-folder-id="bin" data-drop-target={isDropTarget("bin") || undefined} aria-current={currentFolderId === "bin" ? "page" : undefined} onClick={() => navigateTo("bin")} className={styles.location}>
                <Trash2 size={19} strokeWidth={1.7} aria-hidden="true" />
                <span>Bin</span>
                {trashRootCount > 0 && <span className={styles.badge}>{trashRootCount}</span>}
              </button>
            </div>
          </nav>
        )}

        <div className={styles.main}>
          <div className={styles.toolbar} role="toolbar" aria-label="Finder navigation">
            <button type="button" className={styles.toolButton} onClick={toggleSidebar} aria-label={sidebarVisible ? "Hide sidebar" : "Show sidebar"} aria-expanded={sidebarVisible} aria-controls={sidebarVisible ? sidebarId : undefined} title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}>
              <PanelLeft size={19} strokeWidth={1.7} aria-hidden="true" />
            </button>
            <div className={styles.history}>
              <button type="button" className={styles.toolButton} aria-label="Back" title="Back" onClick={() => navigateHistory(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>
                <ChevronLeft size={23} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <button type="button" className={styles.toolButton} aria-label="Forward" title="Forward" onClick={() => navigateHistory(Math.min(history.length - 1, currentIndex + 1))} disabled={currentIndex === history.length - 1}>
                <ChevronRight size={23} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
            <h1 className={styles.title} title={currentTitle}>{currentTitle}</h1>
            <div className={styles.fileActions}>
              <button type="button" className={styles.toolButton} aria-label="New Folder" title="New Folder" disabled={!canCreate} onClick={() => createFolderAndRename(window.id, currentFolderId)}><FolderPlus size={19} strokeWidth={1.7} aria-hidden="true" /></button>
              <button type="button" className={styles.toolButton} aria-label="Rename selected folder" title="Rename selected folder (F2)" disabled={!canRename} onClick={() => { if (selectedItem) useFileInteractionStore.getState().beginRename(window.id, selectedItem.id); }}><Pencil size={17} strokeWidth={1.7} aria-hidden="true" /></button>
            </div>
            {currentFolderId === "bin" && <button type="button" className={styles.emptyButton} onClick={emptyTrash} disabled={trashItems.length === 0}>Empty Bin</button>}
          </div>

          <div ref={contentRef} data-finder-content={currentFolderId} data-drop-target={isDropTarget(currentFolderId) || undefined} className={styles.content} tabIndex={0} aria-label={`${currentTitle} folder area`} onContextMenu={(event) => handleFileContextMenu(event, window.id, currentFolderId)} onPointerDown={(event) => { if (!(event.target as HTMLElement).closest("[data-file-item]")) useFileInteractionStore.getState().selectItem(window.id, null); }}>
            {isCurrentFolderGone ? (
              <div className={styles.emptyState}>
                <Trash2 size={36} strokeWidth={1.2} aria-hidden="true" />
                <p>{isCurrentFolderMissing ? "This folder is not available." : isCurrentFolderDeleted ? "This folder was permanently deleted." : "This folder was moved to the Bin."}</p>
                <span>{isCurrentFolderMissing ? "A folder removed with Undo returns with Redo." : isCurrentFolderDeleted ? "Emptying the Bin cannot be undone." : "Its contents were moved with it."}</span>
                <button type="button" onClick={() => navigateTo("desktop")} className={styles.emptyButton}>Go to Desktop</button>
              </div>
            ) : items.length === 0 ? (
              <div className={styles.emptyState}>
                {currentFolderId === "bin" ? <Trash2 size={36} strokeWidth={1.2} aria-hidden="true" /> : <Folder size={40} strokeWidth={1.2} aria-hidden="true" />}
                <p>{currentFolderId === "bin" ? "The Bin is empty" : "This folder is empty"}</p>
                <span>{currentFolderId === "bin" ? "Items you move to the Bin appear here." : "There are no items here yet."}</span>
              </div>
            ) : (
              <div className={styles.grid} role="list" aria-label={`${currentTitle} items`} data-finder-grid>
                {items.map((item) => <FinderDragItem key={item.id} item={item} fromFolder={currentFolderId} surfaceId={window.id} isDragging={activeDragId === item.id} isDropTarget={item.type === "folder" && isDropTarget(item.id)} selected={selectedItem?.id === item.id} onSelect={() => useFileInteractionStore.getState().selectItem(window.id, item.id)} navigateTo={navigateTo} />)}
              </div>
            )}
          </div>

          {pathBarVisible && (
            <nav aria-label="Folder path" className={styles.pathBar} data-finder-path>
              <span className={styles.pathRoot} title="Om’s portfolio"><House size={13} aria-hidden="true" /><span>Portfolio</span></span>
              {path.map((id, index) => <span key={id} className={styles.pathSegment}>
                <ChevronRight size={12} aria-hidden="true" />
                {index === path.length - 1 ? <span aria-current="location" title={currentTitle}>{currentTitle}</span> : <button type="button" onClick={() => navigateTo(id)}>{folderName(id, fileSystem)}</button>}
              </span>)}
            </nav>
          )}
          {statusBarVisible && <div className={styles.statusBar} role="status" aria-live="polite" data-finder-status>
            <span>{selectedItem ? `1 of ${items.length} selected` : `${items.length} ${items.length === 1 ? "item" : "items"}`}</span>
            {currentFolderId === "bin" && items.length > 0 && <span className={styles.statusHint}>Open an item to restore it</span>}
          </div>}
        </div>
      </div>
    </div>
  );
}
