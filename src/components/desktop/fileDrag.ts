export const DRAG_THRESHOLD_PX = 6;
export const TRASH_PAD_PX = 40;
export const DESKTOP_ICON_W = 84;
export const DESKTOP_ICON_H = 88;
export const DESKTOP_MENU_H = 32;
export const DESKTOP_DOCK_H = 96;
export const DESKTOP_SCREEN_W = 1400;
export const DESKTOP_SCREEN_H = 900;

export type DragSource = "desktop" | "finder";
export type DropTarget = "desktop" | "finder" | "trash" | null;
export type IconType = "folder" | "file" | "app";

export interface DraggedItem {
  id: string;
  name: string;
  iconType: IconType;
  source: DragSource;
  sourceFolderId?: string;
}

export type DropHit =
  | { target: "trash"; folderId: null }
  | { target: "finder"; folderId: string }
  | { target: "desktop"; folderId: null }
  | { target: null; folderId: null };

function rectContains(r: DOMRect, x: number, y: number, pad = 0): boolean {
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

function frameZ(el: HTMLElement): number {
  const frame = el.closest("[data-window-frame]") as HTMLElement | null;
  if (!frame) return 0;
  const raw = frame.style.zIndex || getComputedStyle(frame).zIndex || "0";
  const z = parseInt(raw, 10);
  return Number.isFinite(z) ? z : 0;
}

function pickTopmost(els: HTMLElement[]): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestZ = -Infinity;
  for (const el of els) {
    const z = frameZ(el);
    if (z >= bestZ) {
      bestZ = z;
      best = el;
    }
  }
  return best;
}

export function clientToDesktopLocal(clientX: number, clientY: number): { x: number; y: number } | null {
  if (typeof document === "undefined") return null;
  const root = document.getElementById("desktop-root");
  if (!root) return { x: clientX, y: clientY };
  const rect = root.getBoundingClientRect();
  const scaleX = rect.width / (root.offsetWidth || 1) || 1;
  const scaleY = rect.height / (root.offsetHeight || 1) || 1;
  return {
    x: (clientX - rect.left) / scaleX,
    y: (clientY - rect.top) / scaleY,
  };
}

export function clampDesktopPosition(x: number, y: number): { x: number; y: number } {
  const maxX = DESKTOP_SCREEN_W - DESKTOP_ICON_W;
  const maxY = DESKTOP_SCREEN_H - DESKTOP_DOCK_H - DESKTOP_ICON_H;
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(DESKTOP_MENU_H, y), maxY),
  };
}

export function defaultDesktopPosition(index: number): { x: number; y: number } {
  return {
    x: DESKTOP_SCREEN_W - DESKTOP_ICON_W - 16,
    y: DESKTOP_MENU_H + 16 + index * DESKTOP_ICON_H,
  };
}

export function hitTestDrop(x: number, y: number, draggedId?: string | null): DropHit {
  if (typeof document === "undefined") return { target: null, folderId: null };

  const bin = document.getElementById("trash-bin");
  if (bin && rectContains(bin.getBoundingClientRect(), x, y, TRASH_PAD_PX)) {
    return { target: "trash", folderId: null };
  }

  const framesAtPoint = Array.from(document.querySelectorAll<HTMLElement>("[data-window-frame]")).filter((el) =>
    rectContains(el.getBoundingClientRect(), x, y)
  );
  const topFrame = pickTopmost(framesAtPoint);

  const folderHits = Array.from(document.querySelectorAll<HTMLElement>("[data-drop-folder-id]")).filter((el) => {
    const id = el.dataset.dropFolderId;
    if (!id || id === draggedId) return false;
    return rectContains(el.getBoundingClientRect(), x, y);
  });
  const contentHits = Array.from(document.querySelectorAll<HTMLElement>("[data-finder-content]")).filter((el) =>
    rectContains(el.getBoundingClientRect(), x, y)
  );

  if (topFrame) {
    const foldersInTop = folderHits.filter((el) => el.closest("[data-window-frame]") === topFrame);
    const topFolder = pickTopmost(foldersInTop);
    if (topFolder?.dataset.dropFolderId) {
      return { target: "finder", folderId: topFolder.dataset.dropFolderId };
    }
    const contentInTop = contentHits.filter((el) => el.closest("[data-window-frame]") === topFrame);
    const topContent = pickTopmost(contentInTop);
    if (topContent?.dataset.finderContent != null) {
      return { target: "finder", folderId: topContent.dataset.finderContent };
    }
    return { target: null, folderId: null };
  }

  const desktopFolder = folderHits.find((el) => !el.closest("[data-window-frame]"));
  if (desktopFolder?.dataset.dropFolderId) {
    return { target: "finder", folderId: desktopFolder.dataset.dropFolderId };
  }

  const dock = document.querySelector<HTMLElement>("[data-dock]");
  if (dock && rectContains(dock.getBoundingClientRect(), x, y)) {
    return { target: null, folderId: null };
  }

  const desktop = document.getElementById("desktop-root");
  if (desktop && rectContains(desktop.getBoundingClientRect(), x, y)) {
    return { target: "desktop", folderId: null };
  }

  return { target: null, folderId: null };
}

export function applyGrabCursor() {
  if (typeof document === "undefined") return;
  document.body.classList.add("is-finder-dragging");
  document.body.style.cursor = "grabbing";
  document.documentElement.style.cursor = "grabbing";
  document.body.style.userSelect = "none";
}

export function clearGrabCursor() {
  if (typeof document === "undefined") return;
  document.body.classList.remove("is-finder-dragging");
  document.body.style.cursor = "";
  document.documentElement.style.cursor = "";
  document.body.style.userSelect = "";
}

export function captureOnDesktop(pointerId: number) {
  if (typeof document === "undefined") return;
  const root = document.getElementById("desktop-root");
  if (!root) return;
  try {
    root.setPointerCapture(pointerId);
  } catch {
    // Capture is optional — window listeners still track the gesture.
  }
}

export function releaseDesktopCapture(pointerId: number | null) {
  if (typeof document === "undefined" || pointerId == null) return;
  const root = document.getElementById("desktop-root");
  if (!root) return;
  try {
    if (root.hasPointerCapture?.(pointerId)) root.releasePointerCapture(pointerId);
  } catch {
    // ignore
  }
}
