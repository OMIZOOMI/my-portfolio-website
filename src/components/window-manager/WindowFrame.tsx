"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion } from "framer-motion";
import { Minus, Square, X } from "lucide-react";
import { useWindowStore, type WindowState } from "./useWindowStore";
import { useSystemStore } from "./useSystemStore";
import { useMusicStore } from "../desktop/useMusicStore";
import styles from "./WindowFrame.module.css";
import { getDesktopCoordinateSpace } from "./desktopCoordinates";
import { constrainWindowPosition, getMaximizedWindowRect, getWindowFrameSize } from "./windowGeometry";

interface WindowFrameProps {
  window: WindowState;
  dragConstraintsRef: React.RefObject<HTMLDivElement>;
  children: ReactNode;
}

const GENIE_DURATION = 0.22;

interface GenieTarget {
  dx: number;
  dy: number;
  skew: number;
}

export function WindowFrame({ window: win, dragConstraintsRef, children }: WindowFrameProps) {
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const setWindowPosition = useWindowStore((s) => s.setWindowPosition);
  const toggleMinimize = useWindowStore((s) => s.toggleMinimize);
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize);
  const beginCloseWindow = useWindowStore((s) => s.beginCloseWindow);
  const prefersReducedMotion = useReducedMotion();
  const motionSetting = useSystemStore(s => s.reduceMotion);
  const reduceMotion = prefersReducedMotion || motionSetting;
  const workArea = useWindowStore(s => s.desktopWorkArea);
  const isActive = useWindowStore(s => s.focusedWindowId === win.id);

  const [genie, setGenie] = useState<GenieTarget | null>(null);
  const isMaximized = win.maximized;
  const activeGenie = win.closing ? genie : null;

  const frameRef = useRef<HTMLDivElement>(null);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);

  // Motion stays in desktop-local pixels; the shared projection converts input.
  const x = useMotionValue(win.position.x);
  const y = useMotionValue(win.position.y);
  const rect = isMaximized
    ? getMaximizedWindowRect(workArea)
    : { ...win.position, ...getWindowFrameSize(win.size) };

  useLayoutEffect(() => {
    x.set(rect.x);
    y.set(rect.y);
  }, [rect.x, rect.y, win.position, isMaximized, x, y]);

  useEffect(() => {
    return () => {
      if (closeTimeout.current) clearTimeout(closeTimeout.current);
      dragCleanup.current?.();
    };
  }, []);

  useEffect(() => {
    // Menu Bar and Dock actions can change state while a title-bar pointer is held.
    dragCleanup.current?.();
  }, [win.minimized, win.maximized, win.closing]);

  const handleClose = () => {
    // The store guard is synchronous, including repeated clicks in one frame.
    if (!beginCloseWindow(win.id)) return;
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    const closeRequestId = useWindowStore.getState().windows[win.id]?.closeRequestId;
    dragCleanup.current?.();
    // Stop at the close gesture, before the window's exit animation completes.
    if (win.kind === "music") useMusicStore.getState().stop();
    const el = frameRef.current;
    if (!el || reduceMotion) {
      closeWindow(win.id);
      return;
    }

    const desktop = dragConstraintsRef.current;
    const space = desktop ? getDesktopCoordinateSpace(desktop) : null;
    const iconEl = desktop?.querySelector(`[data-dock-app="${win.kind}"]`);
    const dockEl = desktop?.querySelector('[data-dock]');
    const targetRect = iconEl?.getBoundingClientRect() ?? dockEl?.getBoundingClientRect();
    const target = targetRect && space
      ? space.toLocal({ x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 })
      : { x: (desktop?.clientWidth ?? 1400) / 2, y: (desktop?.clientHeight ?? 900) - 40 };
    if (!target) {
      closeWindow(win.id);
      return;
    }
    const dx = target.x - (x.get() + rect.width / 2);
    const dy = target.y - (y.get() + rect.height);
    const skew = Math.max(-18, Math.min(18, dx / 28));

    setGenie({ dx, dy, skew });
    closeTimeout.current = setTimeout(() => {
      if (closeRequestId !== undefined) useWindowStore.getState().completeCloseWindow(win.id, closeRequestId);
    }, GENIE_DURATION * 1000);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary || isMaximized || win.closing || win.minimized) return;
    if ((e.target as HTMLElement).closest("[data-window-controls], button")) return;
    if (useSystemStore.getState().isDragging || useSystemStore.getState().pendingDrag) return;
    e.stopPropagation();
    dragCleanup.current?.();

    const el = e.currentTarget as HTMLElement;
    const desktop = dragConstraintsRef.current;
    const start = desktop && getDesktopCoordinateSpace(desktop)?.toLocal({ x: e.clientX, y: e.clientY });
    if (!desktop || !start) return;
    const origin = { x: x.get(), y: y.get() };
    const frameSize = getWindowFrameSize(win.size);
    el.setPointerCapture(e.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== e.pointerId || useSystemStore.getState().isDragging) return;
      const point = getDesktopCoordinateSpace(desktop)?.toLocal({ x: moveEvent.clientX, y: moveEvent.clientY });
      if (!point) return;
      const position = constrainWindowPosition({ x: origin.x + point.x - start.x, y: origin.y + point.y - start.y }, frameSize, useWindowStore.getState().desktopBounds);
      x.set(position.x);
      y.set(position.y);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("blur", onBlur);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      dragCleanup.current = null;
    };

    const finish = () => {
      cleanup();
      setWindowPosition(win.id, { x: x.get(), y: y.get() });
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId === e.pointerId) finish();
    };
    const onBlur = () => finish();

    dragCleanup.current = cleanup;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("blur", onBlur);
  };

  const handleMinimize = () => {
    const current = useWindowStore.getState().windows[win.id];
    if (!current || current.closing || current.minimized) return;
    if (dragCleanup.current) setWindowPosition(win.id, { x: x.get(), y: y.get() });
    dragCleanup.current?.();
    toggleMinimize(win.id);
  };

  const handleMaximize = () => {
    if (dragCleanup.current) setWindowPosition(win.id, { x: x.get(), y: y.get() });
    dragCleanup.current?.();
    toggleMaximize(win.id);
  };


  return (
    <motion.div
      ref={frameRef}
      data-window-frame={win.id}
      data-window-closing={win.closing ? "true" : undefined}
      data-window-active={isActive ? "true" : "false"}
      data-window-maximized={win.maximized ? "true" : "false"}
      data-window-minimized={win.minimized ? "true" : "false"}
      inert={win.minimized}
      className={styles.window}
      style={{
        zIndex: win.zIndex,
        width: rect.width,
        height: rect.height,
        pointerEvents: win.minimized ? "none" : "auto",
        left: x,
        top: y,
        transformOrigin: activeGenie ? "50% 100%" : "50% 50%",
      }}
      initial={reduceMotion ? false : { scale: 0.96, opacity: 0 }}
      animate={
        activeGenie
          ? {
              // Genie suck: stretch slightly, then collapse bottom-first into dock.
              x: [0, activeGenie.dx * 0.08, activeGenie.dx],
              y: [0, -14, activeGenie.dy],
              scaleX: [1, 1.03, 0.18],
              scaleY: [1, 1.06, 0.05],
              skewX: [0, activeGenie.skew * 0.4, 0],
              opacity: [1, 1, 0],
              borderRadius: ["10px", "14px", "0px 0px 50% 50% / 0px 0px 28px 28px"],
            }
          : {
              x: 0,
              scaleX: 1,
              scaleY: 1,
              skewX: 0,
              borderRadius: "10px",
              scale: win.minimized && !reduceMotion ? 0 : 1,
              opacity: win.minimized ? 0 : 1,
              y: win.minimized && !reduceMotion ? 300 : 0,
            }
      }
      exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.9 }}
      transition={
        reduceMotion ? { duration: 0 } : activeGenie
          ? {
              duration: GENIE_DURATION,
              times: [0, 0.32, 1],
              ease: ["easeOut", "easeIn"],
            }
          : { type: "spring", duration: 0.22, bounce: 0 }
      }
      onFocusCapture={() => { if (!win.closing && !win.minimized) focusWindow(win.id); }}
      onPointerDownCapture={(event) => {
        if (win.closing) { event.preventDefault(); event.stopPropagation(); return; }
        focusWindow(win.id);
      }}
      onClickCapture={(event) => { if (win.closing) { event.preventDefault(); event.stopPropagation(); } }}
      onKeyDownCapture={(event) => { if (win.closing) { event.preventDefault(); event.stopPropagation(); } }}
    >
      <div 
        className={styles.titleBar} 
        onPointerDown={handlePointerDown} 
        style={{ cursor: isMaximized ? "default" : "grab" }}
      >
        <div
          className={styles.trafficLights}
          data-window-controls
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <button type="button" className={styles.control} data-window-control="close" onClick={handleClose} disabled={win.closing} aria-label="Close">
            <span className={`${styles.dot} ${styles.close}`}><X size={8} strokeWidth={3} /></span>
          </button>
          <button type="button" className={styles.control} data-window-control="minimize" onClick={handleMinimize} disabled={win.closing} aria-label="Minimize">
            <span className={`${styles.dot} ${styles.minimize}`}><Minus size={8} strokeWidth={3} /></span>
          </button>
          <button type="button" className={styles.control} data-window-control="maximize" onClick={handleMaximize} disabled={win.closing} aria-label={isMaximized ? "Restore" : "Maximize"} aria-pressed={isMaximized}>
            <span className={`${styles.dot} ${styles.maximize}`}><Square size={6} strokeWidth={3} /></span>
          </button>
        </div>

        <span className={styles.title}>{win.title}</span>
      </div>

      <div className={styles.content} style={{ width: "100%", flex: "1 1 0", minHeight: 0 }}>
        {children}
      </div>
    </motion.div>
  );
}
