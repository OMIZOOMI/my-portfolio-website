type Axis = "x" | "y";
type Remainder = { position: number; fraction: number };
type PendingAxis = { position: number; start: number; next: number };
type ScrollSurface = { element: HTMLElement; style: CSSStyleDeclaration };

const scrollable = /^(auto|scroll|overlay)$/;

export function wheelPixels(delta: number, mode: number, lineSize: number, pageSize: number) {
  if (!Number.isFinite(delta)) return 0;
  return delta * (mode === 1 ? lineSize : mode === 2 ? pageSize : 1);
}

/** Own wheel scrolling only inside Drei's transformed screen. WebKit can fail
 * to scroll nested composited regions here even though pointer clicks work.
 * Coalesce input into one write per display frame, retaining the device's own
 * momentum, sign and fractional deltas without an easing/inertia animation.
 * Touch, keyboard, scrollbars, flat desktop and modified gestures stay native. */
export function bindProjectedDesktopScroll(root: HTMLElement) {
  if (!root.closest("[data-desktop-projection]")) return () => {};
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (!view) return () => {};
  const fractions = new WeakMap<HTMLElement, Partial<Record<Axis, Remainder>>>();
  const pending = new Map<HTMLElement, Partial<Record<Axis, PendingAxis>>>();
  let frame: number | null = null;

  const range = ({ element, style }: ScrollSurface, axis: Axis) => {
    const size = axis === "y" ? element.scrollHeight - element.clientHeight : element.scrollWidth - element.clientWidth;
    if (!scrollable.test(axis === "y" ? style.overflowY : style.overflowX) || size <= 1) return null;
    return axis === "x" && style.direction === "rtl" ? { min: -size, max: 0 } : { min: 0, max: size };
  };

  const flush = () => {
    frame = null;
    for (const [element, axes] of pending) {
      if (!element.isConnected || !root.contains(element)) continue;
      const surface = { element, style: view.getComputedStyle(element) };
      for (const axis of ["x", "y"] as const) {
        const queued = axes[axis];
        const bounds = range(surface, axis);
        if (!queued || !bounds) continue;
        const current = axis === "y" ? element.scrollTop : element.scrollLeft;
        // A keyboard/scrollbar/history update in the same frame wins its base
        // position; apply only the pending wheel distance on top of it.
        const target = current === queued.position ? queued.next : current + queued.next - queued.start;
        const next = Math.min(bounds.max, Math.max(bounds.min, target));
        if (axis === "y") element.scrollTop = next;
        else element.scrollLeft = next;
        const actual = axis === "y" ? element.scrollTop : element.scrollLeft;
        const saved = fractions.get(element) ?? {};
        saved[axis] = { position: actual, fraction: Math.abs(next - actual) <= 1 ? next - actual : 0 };
        fractions.set(element, saved);
      }
    }
    pending.clear();
  };

  const move = (surface: ScrollSurface, axis: Axis, delta: number) => {
    const bounds = range(surface, axis);
    if (!bounds || !delta) return delta;
    const { element } = surface;
    const clamp = (value: number) => Math.min(bounds.max, Math.max(bounds.min, value));
    const current = axis === "y" ? element.scrollTop : element.scrollLeft;
    const axes = pending.get(element) ?? {};
    const queued = axes[axis];
    const previous = fractions.get(element)?.[axis];
    // Discard rounding carry after keyboard, scrollbar or history restoration.
    const fraction = previous?.position === current ? previous.fraction : 0;
    const start = clamp(queued ? queued.next + current - queued.position : current + fraction);
    const next = clamp(start + delta);
    if (next !== start) {
      axes[axis] = {
        position: current,
        start: queued ? clamp(queued.start + current - queued.position) : start,
        next,
      };
      pending.set(element, axes);
      if (frame === null) frame = view.requestAnimationFrame(flush);
    }
    return delta - (next - start);
  };

  const onWheel = (event: WheelEvent) => {
    // Pinch is reported as ctrl+wheel. Shift/horizontal remapping and browser
    // shortcuts belong to the browser; never cancel an uncancelable native tail.
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const direct = event.composedPath().find((node) => node instanceof view.Element && root.contains(node));
    // A wheel transaction may retain its original target. Hit-test the current
    // pointer so crossing between app panes doesn't keep scrolling the old pane.
    const hit = doc.elementFromPoint(event.clientX, event.clientY);
    if (hit && !root.contains(hit)) return;
    let node = hit && root.contains(hit) ? hit : direct instanceof view.Element ? direct : null;
    if (!node) return;

    const surfaces: ScrollSurface[] = [];
    while (node && node !== root) {
      if (node instanceof view.HTMLElement) surfaces.push({ element: node, style: view.getComputedStyle(node) });
      node = node.parentElement;
    }
    const firstY = surfaces.find((surface) => range(surface, "y"));
    const firstX = surfaces.find((surface) => range(surface, "x"));
    const lineSize = Number.parseFloat((firstY ?? firstX)?.style.lineHeight ?? "") || 16;
    let y = wheelPixels(event.deltaY, event.deltaMode, lineSize, firstY?.element.clientHeight ?? root.clientHeight);
    let x = wheelPixels(event.deltaX, event.deltaMode, lineSize, firstX?.element.clientWidth ?? root.clientWidth);
    if (!(y && firstY) && !(x && firstX)) return;

    // Cancel before assigning scroll positions, so native and manual motion
    // cannot both consume this event. Contain the gesture at the screen edge.
    event.preventDefault();
    if (!event.defaultPrevented) return;
    for (const surface of surfaces) {
      if (range(surface, "y")) {
        y = move(surface, "y", y);
        if (/^(contain|none)$/.test(surface.style.overscrollBehaviorY)) y = 0;
      }
      if (range(surface, "x")) {
        x = move(surface, "x", x);
        if (/^(contain|none)$/.test(surface.style.overscrollBehaviorX)) x = 0;
      }
      if (!x && !y) break;
    }
  };

  // Capture outside the Canvas/React passive event delegation. Scope is checked
  // above, so workspace controls and everything outside the screen stay native.
  doc.addEventListener("wheel", onWheel, { capture: true, passive: false });
  root.dataset.scrollRouting = "projected";
  return () => {
    doc.removeEventListener("wheel", onWheel, true);
    if (frame !== null) view.cancelAnimationFrame(frame);
    pending.clear();
    delete root.dataset.scrollRouting;
  };
}
