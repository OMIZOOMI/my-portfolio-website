"use client";

import { getProjectById } from "../../data/projectsData";

import type { FileItem } from "../../data/fileSystem";
import { APPS_FOLDER_ID, portfolioAppForFile, portfolioAppName, type PortfolioAppId } from "../../data/portfolioApps";
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

export function openPortfolioApp(id: PortfolioAppId) {
  const windowId = id === "finder" ? "finder-desktop" : `app-${id}`;
  const title = id === "finder" ? "Desktop" : portfolioAppName(id);
  useWindowStore.getState().openWindow({
    id: windowId, kind: id, title,
    ...(id === "finder" ? { folderId: "desktop" } : {}),
    ...(id === "heat-sink" ? { size: { width: 790, height: 610 } } : {}),
  });
  return useWindowStore.getState().focusedWindowId ?? windowId;
}

/** Keep the built-in About Me identity distinct from a visitor's similarly named folder. */
export function openPortfolioItem(item: FileItem, options: { navigateFolder?: (id: string) => void; newWindow?: boolean } = {}) {
  if (item.id === "about-me") { openAboutMe(); return; }
  if (item.type === "folder") {
    if (options.navigateFolder && !options.newWindow) options.navigateFolder(item.id);
    else useWindowStore.getState().openWindow({ id: `finder-${item.id}${options.newWindow ? `-${crypto.randomUUID()}` : ""}`, kind: "finder", title: item.id === APPS_FOLDER_ID ? "Apps" : item.name, folderId: item.id });
    return;
  }
  const app = item.type === "app" ? portfolioAppForFile(item.id) : undefined;
  if (app) { openPortfolioApp(app); return; }
  useWindowStore.getState().openWindow({ id: `file-${item.id}`, kind: "file-viewer", title: (item.type === "file" ? getProjectById(item.id)?.name : null) ?? item.name });
}
