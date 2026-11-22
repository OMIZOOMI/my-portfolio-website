"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
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
import { DESKTOP_ICON_W, DESKTOP_MENU_H, layoutDesktopIcons } from "./desktopIconLayout";
import iconStyles from "./DesktopIcon.module.css";
import { useDisplayStore } from "../window-manager/useDisplayStore";
import { GameMenu } from "../easter-egg/GameMenu";
import { FileContextMenu } from "./FileContextMenu";
import { useFileInteractionStore } from "./useFileInteractionStore";
import { handleFileContextMenu, handleFileSurfaceKeyDown } from "./fileSurfaceEvents";
import { bindProjectedDesktopScroll } from "./projectedDesktopScroll";
import { useMusicStore } from "./useMusicStore";
import styles from "./DesktopEnvironment.module.css";

function DraggableDesktopItem({
  id,
  label,
  variant,
  x,
  y,
  isDragging,
  manual,
}: {
  id: string;
  label: string;
  variant: "folder" | "file" | "app";
  x: number;
  y: number;
  isDragging: boolean;
  manual: boolean;
}) {
  const handleOpen = () => openPortfolioItem({ id, name: label, type: variant });

  return (
    <div
      data-file-item={id}
      data-desktop-placement={manual ? "manual" : "automatic"}
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
      onFocusCapture={(event) => {
        if (manual) return;
        const item = event.currentTarget;
        const board = item.closest<HTMLElement>("[data-desktop-icons]");
        if (!board || board.scrollHeight <= board.clientHeight) return;
        const top = item.offsetTop, bottom = top + item.offsetHeight;
        const inset = Number(board.dataset.topInset) || 48;
        const bottomInset = Number(board.dataset.bottomInset) || 8;
        // Scroll only this icon region, never Drei's projection ancestors.
        if (top < board.scrollTop + inset) board.scrollTop = Math.max(0, top - inset);
        else if (bottom > board.scrollTop + board.clientHeight - bottomInset) board.scrollTop = bottom - board.clientHeight + bottomInset;
      }}
    >
      <DesktopIcon label={label} variant={variant} onOpen={handleOpen} itemId={id} surfaceId="desktop" onSelect={() => useFileInteractionStore.getState().selectItem("desktop", id)} />
    </div>
  );
}

export function DesktopEnvironment({ introduction, compact = false, onStartupChromeReady }: {
  introduction?: ReactNode;
  compact?: boolean;
  onStartupChromeReady?: () => void;
}) {
  const desktopRef = useRef<HTMLDivElement>(null);
  const interfaceScale = useDisplayStore(s => s.interfaceScale);
  const iconScale = useDisplayStore(s => s.iconScale);
  const [desktopSize, setDesktopSize] = React.useState({ width: 1400, height: 900, menuHeight: DESKTOP_MENU_H, dockInset: 96 });
  const iconsRef = useRef<HTMLDivElement>(null);
  const [iconScroll, setIconScroll] = React.useState(0);
  useEffect(() => {
    const desktop = desktopRef.current;
    if (desktop) return bindProjectedDesktopScroll(desktop);
  }, []);

  useEffect(() => {
    const desktop = desktopRef.current;
    if (!desktop || !onStartupChromeReady) return;
    const images = Array.from(desktop.querySelectorAll<HTMLImageElement>("[data-dock-app] img, [data-desktop-icons] img"));
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(deadline);
      onStartupChromeReady();
    };
    // Decorative images have labeled controls even if a request fails.
    const deadline = window.setTimeout(finish, 3500);
    void Promise.allSettled(images.map(image => image.decode())).then(finish);
    return () => { settled = true; window.clearTimeout(deadline); };
  }, [onStartupChromeReady]);
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
    document.documentElement.dataset.theme = isDarkMode ? "dark" : "light";
  }, [isDarkMode]);

  // Own this measurement here: the desktop host ref is attached before its
  // owner layout effect; a descendant layout effect can see a null parent ref.
  useLayoutEffect(() => {
    const desktop = desktopRef.current;
    if (!desktop) return;
    const menu = desktop.querySelector<HTMLElement>("[data-menu-bar]");
    const dock = desktop.querySelector<HTMLElement>("[data-dock]");
    const measure = () => {
      if (!desktop.clientWidth || !desktop.clientHeight) return;
      const top = menu ? menu.offsetTop + menu.offsetHeight : 0;
      const size = { width: desktop.clientWidth, height: desktop.clientHeight, menuHeight: Math.max(DESKTOP_MENU_H, top), dockInset: dock ? Math.max(0, desktop.clientHeight - dock.offsetTop) : 0 };
      setDesktopSize(previous => previous.width === size.width && previous.height === size.height && previous.menuHeight === size.menuHeight && previous.dockInset === size.dockInset ? previous : size);
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

  const iconLayout = useMemo(() => layoutDesktopIcons(desktopIds, desktopPositions, { ...desktopSize, iconScale }), [desktopIds, desktopPositions, desktopSize, iconScale]);
  // Extra scrolling room keeps the last automatic row above floating controls.
  // This is scroller padding only: manual icons and window drag bounds still
  // include the real bottom edge, including the space behind the Dock.
  const iconBottomInset = desktopSize.dockInset + 48;
  const iconContentHeight = Math.max(iconLayout.contentHeight, iconLayout.automaticBottom + iconBottomInset);
  useLayoutEffect(() => {
    const board = iconsRef.current;
    if (!board) return;
    board.scrollTop = Math.min(board.scrollTop, Math.max(0, iconContentHeight - board.clientHeight));
    setIconScroll(previous => previous === board.scrollTop ? previous : board.scrollTop);
  }, [iconContentHeight, desktopSize.height]);
  const visibleDesktopIds = desktopIds.filter((id) => !trashItems.includes(id) && !deletedIds.includes(id));

  const restartDesktop = () => {
    useSystemStore.getState().endDrag();
    useMusicStore.getState().stop();
    useFileInteractionStore.setState(useFileInteractionStore.getInitialState());
    const { windows, nextZIndex, focusedWindowId, isVMLocked } = useWindowStore.getInitialState();
    useWindowStore.setState({ windows, nextZIndex, focusedWindowId, isVMLocked });
    setGameMenuOpen(false);
    if (iconsRef.current) iconsRef.current.scrollTop = 0;
    desktopRef.current?.focus({ preventScroll: true });
  };

  return (
    <div
      id="desktop-root"
      data-compact-desktop={compact || undefined}
      data-file-surface="desktop"
      ref={desktopRef}
      tabIndex={0}
      aria-label="Portfolio desktop"
      data-icon-scale={iconScale}
      data-menu-height={desktopSize.menuHeight}
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
       style={{ backgroundColor: "#1e1e1e", width: `${100 / interfaceScale}%`, height: `${100 / interfaceScale}%`, transform: interfaceScale === 1 ? "none" : `scale(${interfaceScale})`, transformOrigin: "0 0", "--desktop-icon-scale": iconScale, "--desktop-icon-column-space": `${DESKTOP_ICON_W * iconScale + 28}px`, "--desktop-introduction-right": `${DESKTOP_ICON_W * iconScale + 28}px`, "--desktop-menu-height": `${desktopSize.menuHeight}px`, "--desktop-dock-inset": `${desktopSize.dockInset}px`, container: "desktop / inline-size" } as React.CSSProperties}
    >
      <WallpaperBackground compact={compact} />
      <MenuBar compact={compact} onRestart={restartDesktop} />

      <div ref={iconsRef} data-desktop-icons data-top-inset={iconLayout.metrics.top} data-bottom-inset={iconBottomInset} className={iconStyles.desktopItems}
        role="group" aria-label="Desktop folders and files" tabIndex={iconContentHeight > desktopSize.height ? 0 : undefined}
        style={{ scrollPaddingTop: iconLayout.metrics.top, scrollPaddingBottom: iconBottomInset }} onScroll={event => setIconScroll(event.currentTarget.scrollTop)}>
      <div className={iconStyles.desktopCanvas} style={{ height: iconContentHeight }}>
      {visibleDesktopIds.map((id) => {
        const item = fileSystem.desktop?.find((file) => file.id === id) ?? getFileItem(id) ?? { id, name: id, type: "folder" as const };
        const manual = Object.hasOwn(desktopPositions, id);
        const pos = iconLayout.positions[id];
        return (
          <DraggableDesktopItem
            key={id}
            id={id}
            label={item.name}
            variant={item.type}
            x={pos.x}
            y={pos.y + (manual ? iconScroll : 0)}
            manual={manual}
            isDragging={activeDragId === id}
          />
        );
      })}
      </div>
      </div>

      <WindowManager
        compact={compact}
        dragConstraintsRef={desktopRef as React.RefObject<HTMLDivElement>}
        onActivateGameMenu={() => setGameMenuOpen(true)}
      />
      <Dock />
      {introduction && <div className={styles.introductionLayer} data-introduction-layer>{introduction}</div>}
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
