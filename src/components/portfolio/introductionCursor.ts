export interface CursorPoint { x: number; y: number }
export interface CursorTarget { x: number; y: number; width: number; height: number }

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function cursorTransform(point: CursorPoint) {
  const x = Number.isFinite(point.x) ? point.x : 0;
  const y = Number.isFinite(point.y) ? point.y : 0;
  return `translate3d(${x}px, ${y}px, 0)`;
}

export function cursorPointFromTarget(target: CursorTarget | null): CursorPoint | null {
  return target ? { x: target.x + target.width / 2, y: target.y + target.height / 2 } : null;
}

/** Step changes are deliberately slow enough to follow; live target updates
 * stay short so resize/scroll/window movement does not make the guide lag. */
export function cursorTravelDuration(previous: CursorPoint | null, next: CursorPoint, stepChanged: boolean, reduceMotion: boolean) {
  if (reduceMotion || !previous) return 0;
  const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
  if (!Number.isFinite(distance)) return 0;
  return Math.round(stepChanged
    ? clamp(700 + distance * 0.2, 700, 900)
    : clamp(120 + distance * 0.25, 120, 240));
}
