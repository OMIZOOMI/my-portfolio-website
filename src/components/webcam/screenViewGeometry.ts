import { Vector3, type Camera, type Matrix4 } from "three";
import type { CoordinatePoint } from "../window-manager/desktopCoordinates";

/** Map the calibrated 3D display plane straight to the viewport. A single
 * planar transform keeps WebKit's paint and hit testing in the same space. */
export function laptopProjectionMatrix(
  width: number, height: number, unitsPerPixel: number, plane: Matrix4, camera: Camera,
  viewport: { width: number; height: number },
) {
  const vertex = new Vector3();
  const corners = [[-width / 2, height / 2], [width / 2, height / 2], [width / 2, -height / 2], [-width / 2, -height / 2]]
    .map(([x, y]) => {
      vertex.set(x * unitsPerPixel, y * unitsPerPixel, 0).applyMatrix4(plane).project(camera);
      return { x: (vertex.x + 1) * viewport.width / 2, y: (1 - vertex.y) * viewport.height / 2 };
    });
  return screenQuadMatrix(width, height, corners);
}

/** Project a rectangle onto an ordered quadrilateral, in its parent's pixels. */
export function screenQuadMatrix(width: number, height: number, points: CoordinatePoint[]): string | null {
  if (points.length !== 4 || width <= 0 || height <= 0 || !Number.isFinite(width + height)
    || points.some(p => !Number.isFinite(p.x + p.y))) return null;
  const [p0, p1, p2, p3] = points;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  if (Math.abs(dx3) + Math.abs(dy3) > 1e-8) {
    const denominator = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(denominator) < 1e-8) return null;
    g = (dx3 * dy2 - dx2 * dy3) / denominator;
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
  }
  const matrix = [
    (p1.x - p0.x + g * p1.x) / width, (p1.y - p0.y + g * p1.y) / width, 0, g / width,
    (p3.x - p0.x + h * p3.x) / height, (p3.y - p0.y + h * p3.y) / height, 0, h / height,
    0, 0, 1, 0, p0.x, p0.y, 0, 1,
  ];
  return matrix.every(Number.isFinite) ? `matrix3d(${matrix.join(",")})` : null;
}
