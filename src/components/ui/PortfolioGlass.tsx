"use client";

import { forwardRef, useEffect, useRef, type CSSProperties } from "react";
import { Glass, type ButtonProps, type SwitchProps } from "glisse";
import { useReducedMotion } from "framer-motion";
import { useSystemStore } from "../window-manager/useSystemStore";
import { getDesktopCoordinateSpace, type CoordinatePoint } from "../window-manager/desktopCoordinates";
import { createFramePointer } from "./framePointer";
import styles from "./PortfolioGlass.module.css";

/** Use the reference library's lens without cloning the desktop or its media.
 * No data-glisse-backdrop is registered: browsers use the live CSS backdrop,
 * with Glisse's frosted/rim fallback where SVG backdrop refraction is absent.
 */
export function GlassSurface({ className = "" }: { className?: string }) {
  return <Glass aria-hidden="true" className={`${styles.surface} ${className}`} data-portfolio-glass-surface />;
}

export const GlassButton = forwardRef<HTMLButtonElement, ButtonProps>(function GlassButton({
  className = "", children, icon, variant = "glass", destructive, tint, style, type = "button", ...props
}, ref) {
  // Keep glyphs out of the filtered/animated surface. Glisse still supplies
  // the real lens, but only its decorative backing is composited and pressed.
  return <button {...props} ref={ref} type={type} className={`${styles.button} ${className}`}
    data-portfolio-glass-button data-variant={variant} data-destructive={destructive || undefined}
    style={{ ...style, ...(tint ? { "--lg-tint": tint } : {}) } as CSSProperties}>
    <GlassSurface className={styles.buttonSurface} />
    <span className={styles.label}>{icon}{children}</span>
  </button>;
});

export function GlassSwitch({ className = "", checked, onCheckedChange, style, ...props }: SwitchProps & { checked: boolean }) {
  const systemReduced = useReducedMotion();
  const appReduced = useSystemStore(state => state.reduceMotion);
  const ignoreClick = useRef(false);
  const gesture = useRef<{
    id: number; from: number; value: number; moved: boolean;
    pointer: ReturnType<typeof createFramePointer<CoordinatePoint>>;
    element: HTMLButtonElement;
  } | null>(null);
  useEffect(() => () => gesture.current?.pointer.cancel(), []);

  const settle = (commit: boolean) => {
    const current = gesture.current;
    if (!current) return;
    current.pointer.flush();
    gesture.current = null;
    const next = commit ? (current.moved ? current.value >= .5 : !current.from) : !!current.from;
    current.element.style.setProperty("--switch-position", next ? "1" : "0");
    current.element.removeAttribute("data-switch-dragging");
    if (current.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
    if (commit && next !== checked) onCheckedChange?.(next);
  };

  // One stable button keeps keyboard focus when Reduce Motion changes. Only
  // the thumb transforms; no refraction work or React updates on pointermove.
  return <button {...props} type="button" role="switch" aria-checked={checked}
    data-reduced-motion={systemReduced || appReduced || undefined}
    className={`${styles.switch} ${className}`}
    style={{ ...style, "--switch-position": checked ? 1 : 0 } as CSSProperties}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary || props.disabled) return;
      gesture.current?.pointer.cancel();
      const element = event.currentTarget;
      const desktop = element.closest<HTMLElement>("#desktop-root");
      const local = (point: CoordinatePoint) => desktop ? getDesktopCoordinateSpace(desktop)?.toLocal(point) : point;
      const start = local({ x: event.clientX, y: event.clientY });
      if (!start) return;
      element.focus({ preventScroll: true });
      element.setPointerCapture(event.pointerId);
      ignoreClick.current = false;
      const pointer = createFramePointer<CoordinatePoint>(point => {
        const current = gesture.current;
        const position = local(point);
        if (!current || !position) return;
        const dx = position.x - start.x;
        if (!current.moved && Math.abs(dx) < 4) return;
        current.moved = true;
        element.setAttribute("data-switch-dragging", "true");
        current.value = Math.max(0, Math.min(1, current.from + dx / (element.clientWidth - 26)));
        element.style.setProperty("--switch-position", String(current.value));
      });
      gesture.current = { id: event.pointerId, from: checked ? 1 : 0, value: checked ? 1 : 0, moved: false, pointer, element };
    }}
    onPointerMove={event => {
      if (gesture.current?.id === event.pointerId) gesture.current.pointer.push({ x: event.clientX, y: event.clientY });
    }}
    onPointerUp={event => {
      if (gesture.current?.id !== event.pointerId) return;
      gesture.current.pointer.push({ x: event.clientX, y: event.clientY });
      ignoreClick.current = true;
      settle(true);
    }}
    onPointerCancel={() => { ignoreClick.current = false; settle(false); }}
    onLostPointerCapture={() => settle(false)}
    onClick={event => {
      if (event.detail !== 0 && ignoreClick.current) { ignoreClick.current = false; return; }
      ignoreClick.current = false;
      onCheckedChange?.(!checked);
    }}><span aria-hidden="true" /></button>;
}
