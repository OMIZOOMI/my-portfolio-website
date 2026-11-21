"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion } from "framer-motion";
import { Minus, Square, X } from "lucide-react";
import { useWindowStore, type WindowState } from "./useWindowStore";
import { useSystemStore } from "./useSystemStore";
import { useMusicStore } from "../desktop/useMusicStore";
import { getProjectById } from "../../data/projectsData";
import styles from "./WindowFrame.module.css";
import { GlassSurface } from "../ui/PortfolioGlass";
import { createFramePointer } from "../ui/framePointer";
import { getDesktopCoordinateSpace } from "./desktopCoordinates";
import { constrainWindowPosition, getMaximizedWindowRect, getWindowFrameSize, MIN_RESIZE_FRAME_SIZE, resizeWindowRect, type WindowResizeEdge } from "./windowGeometry";
import { focusMinimizedWindowControl } from "./windowFocus";
import { appWindowTitle } from "../../data/appIdentity";

interface WindowFrameProps {
  window: WindowState;
  dragConstraintsRef: React.RefObject<HTMLDivElement>;
  children: ReactNode;
}

const GENIE_DURATION = 0.22;
const WINDOW_RADIUS = "18px";
const RESIZE_EDGES: readonly WindowResizeEdge[] = ["nw", "n", "ne", "w", "sw", "se", "e", "s"];

interface GenieTarget {
  dx: number;
  dy: number;
  skew: number;
}

export function WindowFrame({ window: win, dragConstraintsRef, children }: WindowFrameProps) {
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const setWindowPosition = useWindowStore((s) => s.setWindowPosition);
  const setWindowRect = useWindowStore((s) => s.setWindowRect);
  const toggleMinimize = useWindowStore((s) => s.toggleMinimize);
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize);
  const beginCloseWindow = useWindowStore((s) => s.beginCloseWindow);
  const prefersReducedMotion = useReducedMotion();
  const motionSetting = useSystemStore(s => s.reduceMotion);
  const reduceMotion = prefersReducedMotion || motionSetting;
  const workArea = useWindowStore(s => s.desktopWorkArea);
  const desktopBounds = useWindowStore(s => s.desktopBounds);
  const isActive = useWindowStore(s => s.focusedWindowId === win.id);

  const [genie, setGenie] = useState<GenieTarget | null>(null);
  const isMaximized = win.maximized;
  // Retained file windows may carry an older display title; their IDs stay intact.
  const title = (win.kind === "file-viewer" ? getProjectById(win.id.replace(/^file-/, ""))?.name : null) ?? appWindowTitle(win);
  const activeGenie = win.closing ? genie : null;

  const frameRef = useRef<HTMLDivElement>(null);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef<{ cleanup: () => void; finish: () => void } | null>(null);

  // Motion stays in desktop-local pixels; the shared projection converts input.
  const x = useMotionValue(win.position.x);
  const y = useMotionValue(win.position.y);
  const width = useMotionValue(getWindowFrameSize(win.size).width);
  const height = useMotionValue(getWindowFrameSize(win.size).height);
  const rect = isMaximized
    ? getMaximizedWindowRect(workArea)
    : { ...win.position, ...getWindowFrameSize(win.size) };

  useLayoutEffect(() => {
    gesture.current?.cleanup();
    x.set(rect.x);
    y.set(rect.y);
    width.set(rect.width);
    height.set(rect.height);
  }, [rect.x, rect.y, rect.width, rect.height, win.minimized, win.closing, isMaximized, desktopBounds, x, y, width, height]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || !isActive || win.minimized || win.closing || frame.contains(document.activeElement)) return;
    const source = document.activeElement;
    if (source === document.body || source instanceof HTMLElement && source.closest('[data-dock], [data-file-icon], [role="menubar"]')) {
      frame.focus({ preventScroll: true });
    }
  }, [isActive, win.minimized, win.closing]);

  useEffect(() => {
    return () => {
      if (closeTimeout.current) clearTimeout(closeTimeout.current);
      gesture.current?.cleanup();
    };
  }, []);

  const handleClose = () => {
    gesture.current?.finish();
    // The store guard is synchronous, including repeated clicks in one frame.
    if (!beginCloseWindow(win.id)) return;
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    const closeRequestId = useWindowStore.getState().windows[win.id]?.closeRequestId;
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
    const dx = target.x - (x.get() + width.get() / 2);
    const dy = target.y - (y.get() + height.get());
    const skew = Math.max(-18, Math.min(18, dx / 28));

    setGenie({ dx, dy, skew });
    closeTimeout.current = setTimeout(() => {
      if (closeRequestId !== undefined) useWindowStore.getState().completeCloseWindow(win.id, closeRequestId);
    }, GENIE_DURATION * 1000);
  };

  const beginPointerGesture = (e: ReactPointerEvent<HTMLElement>, edge?: WindowResizeEdge) => {
    if (e.button !== 0 || !e.isPrimary || isMaximized || win.closing || win.minimized) return;
    if ((e.target as HTMLElement).closest("[data-window-controls], button")) return;
    if (useSystemStore.getState().isDragging || useSystemStore.getState().pendingDrag) return;
    e.stopPropagation();
    if (edge) e.preventDefault();
    gesture.current?.finish();

    const el = e.currentTarget as HTMLElement;
    const desktop = dragConstraintsRef.current;
    const start = desktop && getDesktopCoordinateSpace(desktop)?.toLocal({ x: e.clientX, y: e.clientY });
    if (!desktop || !start) return;
    const origin = { x: x.get(), y: y.get(), width: width.get(), height: height.get() };
    el.setPointerCapture(e.pointerId);

    const pointer = createFramePointer<{ x: number; y: number }>((clientPoint) => {
      if (useSystemStore.getState().isDragging) return;
      // Measure the current projection per painted frame, including during zoom.
      const point = getDesktopCoordinateSpace(desktop)?.toLocal(clientPoint);
      if (!point) return;
      const delta = { x: point.x - start.x, y: point.y - start.y };
      const bounds = useWindowStore.getState().desktopBounds;
      if (edge) {
        const resized = resizeWindowRect(origin, edge, delta, bounds);
        x.set(resized.x);
        y.set(resized.y);
        width.set(resized.width);
        height.set(resized.height);
      } else {
        const position = constrainWindowPosition({ x: origin.x + delta.x, y: origin.y + delta.y }, origin, bounds);
        x.set(position.x);
        y.set(position.y);
      }
    });
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== e.pointerId) return;
      pointer.push({ x: moveEvent.clientX, y: moveEvent.clientY });
    };

    const cleanup = () => {
      pointer.cancel();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("blur", onBlur);
      el.removeEventListener("lostpointercapture", onPointerUp);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      gesture.current = null;
    };

    const finish = () => {
      pointer.flush();
      cleanup();
      const position = { x: x.get(), y: y.get() };
      if (edge) setWindowRect(win.id, { ...position, width: width.get(), height: height.get() });
      else setWindowPosition(win.id, position);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== e.pointerId) return;
      if (event.type === "pointerup") pointer.push({ x: event.clientX, y: event.clientY });
      finish();
    };
    const onBlur = () => finish();

    gesture.current = { cleanup, finish };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("blur", onBlur);
    el.addEventListener("lostpointercapture", onPointerUp);
  };

  const handleResizeKey = (event: KeyboardEvent, edge: "e" | "s") => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const horizontal = edge === "e";
    const step = event.shiftKey ? 40 : 10;
    const amount = event.key === "Home" ? -Infinity : event.key === "End" ? Infinity
      : event.key === (horizontal ? "ArrowRight" : "ArrowDown") ? step
        : event.key === (horizontal ? "ArrowLeft" : "ArrowUp") ? -step : null;
    if (amount === null) return;
    event.preventDefault();
    event.stopPropagation();
    gesture.current?.finish();
    const bounds = useWindowStore.getState().desktopBounds;
    const distance = Number.isFinite(amount) ? amount : Math.sign(amount) * (horizontal ? bounds.width : bounds.height);
    setWindowRect(win.id, resizeWindowRect(rect, edge, { x: horizontal ? distance : 0, y: horizontal ? 0 : distance }, bounds));
  };

  const handleMinimize = () => {
    const current = useWindowStore.getState().windows[win.id];
    if (!current || current.closing || current.minimized) return;
    gesture.current?.finish();
    toggleMinimize(win.id);
    focusMinimizedWindowControl(win.id);
  };

  const handleMaximize = () => {
    gesture.current?.finish();
    toggleMaximize(win.id);
  };


  return (
    <motion.div
      ref={frameRef}
      data-window-frame={win.id}
      role="region"
      aria-label={`${title} window`}
      tabIndex={-1}
      data-window-closing={win.closing ? "true" : undefined}
      data-window-active={isActive ? "true" : "false"}
      data-window-maximized={win.maximized ? "true" : "false"}
      data-window-minimized={win.minimized ? "true" : "false"}
      inert={win.minimized}
      className={styles.window}
      style={{
        ...{ "--window-radius": WINDOW_RADIUS },
        zIndex: win.zIndex,
        width,
        height,
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
              borderRadius: [WINDOW_RADIUS, WINDOW_RADIUS, "0px 0px 50% 50% / 0px 0px 28px 28px"],
            }
          : {
              x: 0,
              scaleX: 1,
              scaleY: 1,
              skewX: 0,
              borderRadius: WINDOW_RADIUS,
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
        onPointerDown={(event) => beginPointerGesture(event)}
        style={{ cursor: isMaximized ? "default" : "grab" }}
      >
        <GlassSurface />
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

        <span className={styles.title}>{title}</span>
      </div>

      <div className={styles.content} style={{ width: "100%", flex: "1 1 0", minHeight: 0 }}>
        {children}
      </div>
      {!isMaximized && !win.minimized && !win.closing && RESIZE_EDGES.map(edge => {
        const keyboardEdge = edge === "e" || edge === "s" ? edge : null;
        const horizontal = keyboardEdge === "e";
        const value = horizontal ? rect.width : rect.height;
        const maximum = horizontal ? desktopBounds.x + desktopBounds.width - rect.x : desktopBounds.y + desktopBounds.height - rect.y;
        return <div key={edge} data-window-resize={edge} className={styles.resizeHandle}
          onPointerDown={(event) => beginPointerGesture(event, edge)}
          {...(keyboardEdge ? {
            role: "separator",
            tabIndex: 0,
            "aria-label": horizontal ? "Resize window width" : "Resize window height",
            "aria-orientation": horizontal ? "vertical" as const : "horizontal" as const,
            "aria-valuemin": Math.round(Math.min(value, horizontal ? MIN_RESIZE_FRAME_SIZE.width : MIN_RESIZE_FRAME_SIZE.height)),
            "aria-valuemax": Math.round(Math.max(value, maximum)),
            "aria-valuenow": Math.round(value),
            onKeyDown: (event: KeyboardEvent) => handleResizeKey(event, keyboardEdge),
          } : { "aria-hidden": true })} />;
      })}
    </motion.div>
  );
}
