/** All values in this module are untransformed, desktop-local CSS pixels. */
export interface DesktopSize {
  width: number;
  height: number;
}

export interface DesktopPoint {
  x: number;
  y: number;
}

export interface DesktopInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** An outer frame rectangle, including its title bar and border. */
export interface WindowRect extends DesktopPoint, DesktopSize {}

export type DesktopWorkArea = WindowRect;

const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const nonNegative = (value: number) => Math.max(0, finite(value, 0));
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

/**
 * Insets are measured from the actual desktop layout, not the browser viewport.
 * A visible dock reserves its unscaled footprint; hover magnification does not
 * continuously resize the work area. A hidden dock can pass a zero inset.
 */
export function getDesktopWorkArea(size: DesktopSize, insets: Partial<DesktopInsets> = {}): DesktopWorkArea {
  const width = nonNegative(size.width);
  const height = nonNegative(size.height);
  const x = Math.min(width, nonNegative(insets.left ?? 0));
  const y = Math.min(height, nonNegative(insets.top ?? 0));
  const right = Math.min(width - x, nonNegative(insets.right ?? 0));
  const bottom = Math.min(height - y, nonNegative(insets.bottom ?? 0));
  return { x, y, width: width - x - right, height: height - y - bottom };
}

/** Pre-measurement only; the mounted desktop publishes its actual layout. */
export const DEFAULT_DESKTOP_WORK_AREA: Readonly<DesktopWorkArea> = Object.freeze(
  getDesktopWorkArea({ width: 1400, height: 900 }, { top: 28, bottom: 90 }),
);

/** Normal windows can move behind the dock, up to the screen's bottom edge. */
export const DEFAULT_DESKTOP_BOUNDS: Readonly<DesktopWorkArea> = Object.freeze(
  getDesktopWorkArea({ width: 1400, height: 900 }, { top: 28 }),
);

/** Maximize uses exactly the available desktop area, including frame chrome. */
export function getMaximizedWindowRect(area: DesktopWorkArea): WindowRect {
  return {
    x: finite(area.x, 0),
    y: finite(area.y, 0),
    width: nonNegative(area.width),
    height: nonNegative(area.height),
  };
}

/**
 * Dragging changes position only. If a legacy window is larger than the area,
 * anchor that axis to the area's start so the title bar remains reachable.
 * Use clampWindowRect when the window should also fit a smaller desktop.
 */
export function constrainWindowPosition(position: DesktopPoint, frameSize: DesktopSize, area: DesktopWorkArea): DesktopPoint {
  const bounds = getMaximizedWindowRect(area);
  return {
    x: clamp(finite(position.x, bounds.x), bounds.x, bounds.x + Math.max(0, bounds.width - nonNegative(frameSize.width))),
    y: clamp(finite(position.y, bounds.y), bounds.y, bounds.y + Math.max(0, bounds.height - nonNegative(frameSize.height))),
  };
}

/**
 * Fit a restored or resized outer frame inside the current work area. Minimums
 * are application policy and yield to the available area on a tiny desktop.
 * Input rectangles are never mutated, so a saved pre-maximize rect stays exact.
 */
export function clampWindowRect(rect: WindowRect, area: DesktopWorkArea, minimumSize: Partial<DesktopSize> = {}): WindowRect {
  const bounds = getMaximizedWindowRect(area);
  const minWidth = Math.min(bounds.width, nonNegative(minimumSize.width ?? 1));
  const minHeight = Math.min(bounds.height, nonNegative(minimumSize.height ?? 1));
  const width = clamp(finite(rect.width, minWidth), minWidth, bounds.width);
  const height = clamp(finite(rect.height, minHeight), minHeight, bounds.height);
  return { ...constrainWindowPosition(rect, { width, height }, bounds), width, height };
}

/** The store's historical window size describes content, excluding frame chrome. */
export function getWindowFrameSize(contentSize: DesktopSize, titleBarHeight = 36, borderWidth = 1): DesktopSize {
  const border = nonNegative(borderWidth) * 2;
  return {
    width: nonNegative(contentSize.width) + border,
    height: nonNegative(contentSize.height) + nonNegative(titleBarHeight) + border,
  };
}

export function getWindowContentSize(frameSize: DesktopSize, titleBarHeight = 36, borderWidth = 1): DesktopSize {
  const border = nonNegative(borderWidth) * 2;
  return {
    width: Math.max(0, nonNegative(frameSize.width) - border),
    height: Math.max(0, nonNegative(frameSize.height) - nonNegative(titleBarHeight) - border),
  };
}
