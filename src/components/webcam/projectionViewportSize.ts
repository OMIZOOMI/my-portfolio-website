export interface ProjectionSize { width: number; height: number }

/** Keep CSS and device-pixel dimensions even. Safari page zoom changes DPR
 * (e.g. Retina at 85% is 1.7); CSS-only rounding still misprojects at that zoom.
 * This is a viewport constraint, never a screen-position compensation.
 * See drei#720 / WebKit#263454. */
export function getProjectionViewportSize(width: number, height: number, pixelRatio = 1): ProjectionSize | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) return null;
  let step = 2;
  if (Number.isFinite(pixelRatio) && pixelRatio > 0) {
    // Common browser zoom ratios have small denominators. Ignore insignificant
    // floating-point DPR noise, and bound trimming for unusual display ratios.
    for (let denominator = 1; denominator <= 20; denominator++) {
      if (Math.abs(pixelRatio * denominator - Math.round(pixelRatio * denominator)) < 0.00001) {
        step = 2 * denominator;
        break;
      }
    }
  }
  return { width: Math.max(2, Math.floor(width / step) * step), height: Math.max(2, Math.floor(height / step) * step) };
}
