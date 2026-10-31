/** Browser/client points and desktop-local points use explicit conversions. */
export interface CoordinatePoint {
  x: number;
  y: number;
}

export interface PlanarQuad {
  topLeft: CoordinatePoint;
  topRight: CoordinatePoint;
  bottomRight: CoordinatePoint;
  bottomLeft: CoordinatePoint;
}

export interface CoordinateSpace {
  toLocal(clientPoint: CoordinatePoint): CoordinatePoint | null;
  toClient(localPoint: CoordinatePoint): CoordinatePoint | null;
}

interface CoordinateSize {
  width: number;
  height: number;
}

const EPSILON = 1e-10;
const finitePoint = (point: CoordinatePoint) => Number.isFinite(point.x) && Number.isFinite(point.y);

/**
 * The inverse of a planar perspective transform, rather than a bounding-box
 * scale approximation. Corners are ordered around the desktop, not sorted by
 * their screen positions. Points outside the desktop remain convertible for
 * pointer capture; callers clamp their own interaction bounds afterwards.
 */
export function createPlanarCoordinateSpace(size: CoordinateSize, quad: PlanarQuad): CoordinateSpace | null {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) return null;
  const corners = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  if (corners.some((point) => !finitePoint(point))) return null;

  // Work relative to the top-left corner to avoid a large client translation
  // dominating the determinant or losing precision during matrix inversion.
  const origin = { ...quad.topLeft };
  const points = corners.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y }));
  const edges = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return { x: next.x - point.x, y: next.y - point.y };
  });
  const areaTolerance = EPSILON * Math.max(1, ...edges.map((edge) => edge.x * edge.x + edge.y * edge.y));
  const crossProducts = edges.map((edge, index) => {
    const next = edges[(index + 1) % edges.length];
    return edge.x * next.y - edge.y * next.x;
  });
  // A folded, collapsed, or horizon-crossing desktop has no usable single
  // visible plane. Either orientation is valid, including a reflected plane.
  if (crossProducts.some((cross) => Math.abs(cross) <= areaTolerance)
    || !crossProducts.every((cross) => Math.sign(cross) === Math.sign(crossProducts[0]))) return null;

  const [, topRight, bottomRight, bottomLeft] = points;
  const dx1 = topRight.x - bottomRight.x;
  const dx2 = bottomLeft.x - bottomRight.x;
  const dx3 = bottomRight.x - topRight.x - bottomLeft.x;
  const dy1 = topRight.y - bottomRight.y;
  const dy2 = bottomLeft.y - bottomRight.y;
  const dy3 = bottomRight.y - topRight.y - bottomLeft.y;
  let g = 0;
  let h = 0;
  if (Math.abs(dx3) + Math.abs(dy3) > EPSILON) {
    const denominator = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(denominator) <= areaTolerance) return null;
    g = (dx3 * dy2 - dx2 * dy3) / denominator;
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
  }
  const a = topRight.x * (1 + g);
  const b = bottomLeft.x * (1 + h);
  const d = topRight.y * (1 + g);
  const e = bottomLeft.y * (1 + h);
  const determinant = a * e - b * d;
  if (![a, b, d, e, g, h, determinant].every(Number.isFinite)
    || Math.abs(determinant) <= EPSILON * Math.max(1, Math.abs(a * e), Math.abs(b * d))
    || [1 + g, 1 + h, 1 + g + h].some((denominator) => denominator <= EPSILON)) return null;

  const inverseG = d * h - e * g;
  const inverseH = b * g - a * h;
  const width = size.width;
  const height = size.height;

  return {
    toClient(point) {
      if (!finitePoint(point)) return null;
      const u = point.x / width;
      const v = point.y / height;
      const denominator = g * u + h * v + 1;
      if (Math.abs(denominator) <= EPSILON * Math.max(1, Math.abs(g * u), Math.abs(h * v))) return null;
      const mapped = { x: origin.x + (a * u + b * v) / denominator, y: origin.y + (d * u + e * v) / denominator };
      return finitePoint(mapped) ? mapped : null;
    },
    toLocal(point) {
      if (!finitePoint(point)) return null;
      const x = point.x - origin.x;
      const y = point.y - origin.y;
      const denominator = inverseG * x + inverseH * y + determinant;
      if (Math.abs(denominator) <= EPSILON * Math.max(1, Math.abs(inverseG * x), Math.abs(inverseH * y), Math.abs(determinant))) return null;
      const mapped = { x: width * (e * x - b * y) / denominator, y: height * (a * y - d * x) / denominator };
      return finitePoint(mapped) ? mapped : null;
    },
  };
}

const probesByDesktop = new WeakMap<HTMLElement, readonly HTMLElement[]>();
const probePositions = [
  { name: "top-left", left: "0", top: "0" },
  { name: "top-right", right: "0", top: "0" },
  { name: "bottom-right", right: "0", bottom: "0" },
  { name: "bottom-left", left: "0", bottom: "0" },
] as const;

function getCornerProbes(root: HTMLElement): readonly HTMLElement[] {
  const existing = probesByDesktop.get(root);
  if (existing?.every((probe) => probe.parentElement === root)) return existing;
  // A replaced root or externally removed probes must not leave partial sets.
  existing?.forEach((probe) => probe.remove());
  const probes = probePositions.map(({ name, ...position }) => {
    const probe = root.ownerDocument.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.setAttribute("data-desktop-coordinate-probe", name);
    Object.assign(probe.style, {
      position: "absolute", width: "0", height: "0", margin: "0", padding: "0", border: "0",
      pointerEvents: "none", visibility: "hidden", transform: "none", ...position,
    });
    root.appendChild(probe);
    return probe;
  });
  probesByDesktop.set(root, probes);
  return probes;
}

/**
 * Root dimensions are local CSS pixels. The desktop root has no border or
 * padding; four zero-size probes inherit the actual Drei/CSS projection.
 * Probes are created once per root, are inert, and need no global listeners.
 * Read their current client positions each time to track camera motion, page
 * zoom, and browser resize without mixing viewport pixels with local pixels.
 */
export function getDesktopCoordinateSpace(root: HTMLElement): CoordinateSpace | null {
  const size = { width: root.clientWidth, height: root.clientHeight };
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) return null;
  try {
    const [topLeft, topRight, bottomRight, bottomLeft] = getCornerProbes(root).map((probe) => {
      const rect = probe.getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    });
    const projected = createPlanarCoordinateSpace(size, { topLeft, topRight, bottomRight, bottomLeft });
    if (projected) return projected;
  } catch {
    // A detached/unsupported DOM surface can still expose an axis-aligned rect.
  }
  const rect = root.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) return null;
  return createPlanarCoordinateSpace(size, {
    topLeft: { x: rect.left, y: rect.top },
    topRight: { x: rect.right, y: rect.top },
    bottomRight: { x: rect.right, y: rect.bottom },
    bottomLeft: { x: rect.left, y: rect.bottom },
  });
}
