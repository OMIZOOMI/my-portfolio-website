 "use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion, useMotionValue } from "framer-motion";
import { Minus, Square, X } from "lucide-react";
import { useWindowStore, type WindowState } from "./useWindowStore";
import { useSystemStore } from "./useSystemStore";
import styles from "./WindowFrame.module.css";

interface WindowFrameProps {
  window: WindowState;
  dragConstraintsRef: React.RefObject<HTMLDivElement>;
  children: ReactNode;
}

const MAXIMIZED_MARGIN = 40;
const PRESS_TRANSITION = { duration: 0.1 };
const GENIE_DURATION = 0.5;

interface GenieTarget {
  dx: number;
  dy: number;
  skew: number;
}

export function WindowFrame({ window: win, children }: WindowFrameProps) {
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const toggleMinimize = useWindowStore((s) => s.toggleMinimize);

  const [isMaximized, setIsMaximized] = useState(false);
  const [isHoveringControls, setIsHoveringControls] = useState(false);
  const [genie, setGenie] = useState<GenieTarget | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Custom 1:1 coordinate tracking to fix the 3D lag
  const x = useMotionValue(win.position.x);
  const y = useMotionValue(win.position.y);

  useEffect(() => {
    if (isMaximized) {
      x.set(MAXIMIZED_MARGIN);
      y.set(MAXIMIZED_MARGIN);
    } else {
      x.set(win.position.x);
      y.set(win.position.y);
    }
  }, [isMaximized, win.position.x, win.position.y, x, y]);

  useEffect(() => {
    return () => {
      if (closeTimeout.current) clearTimeout(closeTimeout.current);
    };
  }, []);

  const handleClose = () => {
    if (genie) return;
    const el = frameRef.current;
    if (!el) {
      closeWindow(win.id);
      return;
    }

    const rect = el.getBoundingClientRect();

    // Prefer sucking into this app's own dock icon, fall back to dock center.
    const iconEl = document.querySelector(`[data-dock-app="${win.kind}"]`);
    const dockEl = document.querySelector('[data-dock]');
    const targetRect = iconEl?.getBoundingClientRect() ?? dockEl?.getBoundingClientRect();

    const targetX = targetRect
      ? targetRect.left + targetRect.width / 2
      : window.innerWidth / 2;
    const targetY = targetRect
      ? targetRect.top + targetRect.height / 2
      : window.innerHeight - 40;

    const winCenterX = rect.left + rect.width / 2;
    const dx = targetX - winCenterX;
    // Move the bottom edge (genie pivot) into the dock.
    const dy = targetY - rect.bottom;
    // Slight sideways bend sells the warp toward the icon.
    const skew = Math.max(-18, Math.min(18, dx / 28));

    setGenie({ dx, dy, skew });
    closeTimeout.current = setTimeout(() => {
      closeWindow(win.id);
    }, GENIE_DURATION * 1000);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isMaximized || genie) return; // Prevent drag if full screen or genie-closing
    if (useSystemStore.getState().isDragging || useSystemStore.getState().pendingDrag) return;
    e.stopPropagation();
    focusWindow(win.id);

    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const scale = rect.width / el.offsetWidth || 1; // Calculates 3D zoom!

    let lastX = e.clientX;
    let lastY = e.clientY;

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (useSystemStore.getState().isDragging) return;
      const deltaX = moveEvent.clientX - lastX;
      const deltaY = moveEvent.clientY - lastY;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      x.set(x.get() + deltaX / scale);
      y.set(y.get() + deltaY / scale);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    const onPointerUp = () => {
      cleanup();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const contentSize = isMaximized
    ? { width: `calc(100vw - ${MAXIMIZED_MARGIN * 2}px)`, height: `calc(100vh - ${MAXIMIZED_MARGIN * 2 + 30}px)` }
    : { width: `${win.size.width}px`, height: `${win.size.height}px` };

  return (
    <motion.div
      ref={frameRef}
      data-window-frame={win.id}
      className={styles.window}
      style={{
        zIndex: win.zIndex,
        pointerEvents: win.minimized || genie ? "none" : "auto",
        left: x, // Controlled manually now!
        top: y,
        transformOrigin: genie ? "50% 100%" : "50% 50%",
      }}
      initial={{ scale: 0.96, opacity: 0 }}
      animate={
        genie
          ? {
              // Genie suck: stretch slightly, then collapse bottom-first into dock.
              x: [0, genie.dx * 0.08, genie.dx],
              y: [0, -14, genie.dy],
              scaleX: [1, 1.03, 0.18],
              scaleY: [1, 1.06, 0.05],
              skewX: [0, genie.skew * 0.4, 0],
              opacity: [1, 1, 0],
              borderRadius: ["10px", "14px", "0px 0px 50% 50% / 0px 0px 28px 28px"],
              filter: [
                "brightness(1) blur(0px)",
                "brightness(1.1) blur(0px)",
                "brightness(0.75) blur(1.5px)",
              ],
            }
          : {
              scale: win.minimized ? 0 : 1,
              opacity: win.minimized ? 0 : 1,
              y: win.minimized ? 300 : 0, // Beautiful drop-down minimize effect
            }
      }
      exit={{ opacity: 0, scale: 0.9 }}
      transition={
        genie
          ? {
              duration: GENIE_DURATION,
              times: [0, 0.32, 1],
              ease: ["easeOut", "easeIn"],
            }
          : { type: "spring", duration: 0.4, bounce: 0 }
      }
      onPointerDownCapture={() => {
        if (!genie) focusWindow(win.id);
      }}
    >
      <div 
        className={styles.titleBar} 
        onPointerDown={handlePointerDown} 
        style={{ cursor: isMaximized ? "default" : "grab" }}
      >
        <div 
          className={styles.trafficLights}
          onMouseEnter={() => setIsHoveringControls(true)}
          onMouseLeave={() => setIsHoveringControls(false)}
          style={{ display: "flex", gap: "8px", padding: "10px 14px", cursor: "default" }}
        >
          <motion.button type="button" onClick={handleClose} whileTap={{ scale: 0.85 }} transition={PRESS_TRANSITION} aria-label="Close" style={{ width: "13px", height: "13px", borderRadius: "50%", backgroundColor: "#ff5f56", border: "0.5px solid rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
            <X size={8} color="#4c0000" strokeWidth={3} style={{ opacity: isHoveringControls ? 1 : 0, transition: "opacity 0.1s ease" }} />
          </motion.button>
          <motion.button type="button" onClick={() => toggleMinimize(win.id)} whileTap={{ scale: 0.85 }} transition={PRESS_TRANSITION} aria-label="Minimize" style={{ width: "13px", height: "13px", borderRadius: "50%", backgroundColor: "#ffbd2e", border: "0.5px solid rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
            <Minus size={8} color="#5c4300" strokeWidth={3} style={{ opacity: isHoveringControls ? 1 : 0, transition: "opacity 0.1s ease" }} />
          </motion.button>
          <motion.button type="button" onClick={() => setIsMaximized((v) => !v)} whileTap={{ scale: 0.85 }} transition={PRESS_TRANSITION} aria-label="Maximize" style={{ width: "13px", height: "13px", borderRadius: "50%", backgroundColor: "#27c93f", border: "0.5px solid rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
            <Square size={6} color="#004d09" strokeWidth={3} style={{ opacity: isHoveringControls ? 1 : 0, transition: "opacity 0.1s ease" }} />
          </motion.button>
        </div>

        <span className={styles.title}>{win.title}</span>
      </div>

      <div className={styles.content} style={contentSize}>
        {children}
      </div>
    </motion.div>
  );
}