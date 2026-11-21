/** Untransformed desktop pixels, shared by layout and pointer-drop clamping. */
export const DESKTOP_ICON_W = 84;
export const DESKTOP_ICON_H = 116;
export const DESKTOP_MENU_H = 28;
export const DESKTOP_SCREEN_W = 1400;
export const DESKTOP_SCREEN_H = 900;
export const DESKTOP_ICON_EDGE = 16;

export interface DesktopPoint { x: number; y: number }
export interface DesktopIconLayout { width: number; height: number; iconScale: number; menuHeight?: number }

const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
export function desktopIconMetrics(layout: DesktopIconLayout) {
  const width = Math.max(1, finite(layout.width, DESKTOP_SCREEN_W));
  const height = Math.max(1, finite(layout.height, DESKTOP_SCREEN_H));
  const scale = Math.max(.1, finite(layout.iconScale, 1));
  const iconWidth = DESKTOP_ICON_W * scale, iconHeight = DESKTOP_ICON_H * scale, gap = 8 * scale;
  const menuHeight = Math.min(height, Math.max(DESKTOP_MENU_H, finite(layout.menuHeight ?? DESKTOP_MENU_H, DESKTOP_MENU_H)));
  const top = menuHeight + DESKTOP_ICON_EDGE;
  const rows = Math.max(1, Math.floor((height - top - DESKTOP_ICON_EDGE + gap) / (iconHeight + gap)));
  const columns = Math.max(1, Math.floor((width - 2 * DESKTOP_ICON_EDGE + gap) / (iconWidth + gap)));
  return { width, height, iconWidth, iconHeight, gap, menuHeight, top, rows, columns };
}

/** Fill down the right column, then left. A full page continues below in the native icon scroller. */
export function desktopGridPosition(index: number, layout: DesktopIconLayout): DesktopPoint {
  const m = desktopIconMetrics(layout), slot = Math.max(0, Math.floor(finite(index, 0)));
  const page = Math.floor(slot / (m.rows * m.columns));
  const column = Math.floor(slot / m.rows) % m.columns;
  const row = slot % m.rows + page * m.rows;
  return {
    x: Math.max(0, m.width - DESKTOP_ICON_EDGE - m.iconWidth - column * (m.iconWidth + m.gap)),
    y: m.top + row * (m.iconHeight + m.gap),
  };
}

/** Manual placement uses real screen bounds, including the space beside/behind the floating Dock. */
export function clampDesktopIconPosition(point: DesktopPoint, layout: DesktopIconLayout): DesktopPoint {
  const m = desktopIconMetrics(layout), margin = 8;
  const minX = Math.min(margin, Math.max(0, m.width - m.iconWidth));
  const minY = Math.min(m.menuHeight + margin, Math.max(0, m.height - m.iconHeight));
  return {
    x: Math.min(Math.max(minX, finite(point.x, minX)), Math.max(minX, m.width - m.iconWidth - margin)),
    y: Math.min(Math.max(minY, finite(point.y, minY)), Math.max(minY, m.height - m.iconHeight - margin)),
  };
}

export function layoutDesktopIcons(ids: readonly string[], manual: Readonly<Record<string, DesktopPoint>>, layout: DesktopIconLayout) {
  const m = desktopIconMetrics(layout), positions: Record<string, DesktopPoint> = {};
  const placed = new Map(ids.filter(id => Object.hasOwn(manual, id)).map(id => [id, clampDesktopIconPosition(manual[id], layout)]));
  const occupied = [...placed.values()];
  let slot = 0, bottom = m.height, automaticBottom = 0;
  for (const id of ids) {
    let point = desktopGridPosition(slot++, layout);
    // Reserve the ID's automatic slot even after a manual move or while in Bin.
    if (placed.has(id)) positions[id] = placed.get(id)!;
    else {
      while (occupied.some(other => point.x < other.x + m.iconWidth && point.x + m.iconWidth > other.x && point.y < other.y + m.iconHeight && point.y + m.iconHeight > other.y)) {
        point = desktopGridPosition(slot++, layout);
      }
      positions[id] = point;
      automaticBottom = Math.max(automaticBottom, point.y + m.iconHeight + DESKTOP_ICON_EDGE);
    }
    bottom = Math.max(bottom, point.y + m.iconHeight + DESKTOP_ICON_EDGE);
  }
  return { positions, contentHeight: bottom, automaticBottom, metrics: m };
}
