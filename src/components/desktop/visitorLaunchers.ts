"use client";

import type { FileItem } from "../../data/fileSystem";
import { useWindowStore } from "../window-manager/useWindowStore";

export function openAboutMe() {
  useWindowStore.getState().openWindow({ id: "about-me", kind: "about-me", title: "About Me" });
}

export function openSettings(section?: "about") {
  useWindowStore.getState().openWindow({ id: "app-settings", kind: "settings", title: "Settings", ...(section ? { settingsSection: section } : {}) });
}

export function openPortfolioAbout() {
  useWindowStore.getState().openWindow({ id: "about-portfolio", kind: "about-app", title: "About This Portfolio", size: { width: 400, height: 400 } });
}

/** Keep the built-in About Me identity distinct from a visitor's similarly named folder. */
export function openPortfolioItem(item: FileItem, options: { navigateFolder?: (id: string) => void; newWindow?: boolean } = {}) {
  if (item.id === "about-me") { openAboutMe(); return; }
  if (item.type === "folder") {
    if (options.navigateFolder && !options.newWindow) options.navigateFolder(item.id);
    else useWindowStore.getState().openWindow({ id: `finder-${item.id}${options.newWindow ? `-${crypto.randomUUID()}` : ""}`, kind: "finder", title: item.name, folderId: item.id });
    return;
  }
  // Existing project IDs already map to populated ProjectDetailView content.
  // Unknown app/game files retain their intentional placeholder route.
  useWindowStore.getState().openWindow({ id: `file-${item.id}`, kind: "file-viewer", title: item.name });
}
