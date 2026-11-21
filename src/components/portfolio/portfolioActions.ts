"use client";

import { getProjectById } from "../../data/projectsData";
import { openAboutMe, openPortfolioItem } from "../desktop/visitorLaunchers";
import { useMailStore } from "../window-manager/useMailStore";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useDisplayStore } from "../window-manager/useDisplayStore";

export type PortfolioAction = "projects" | "about" | "contact" | "screen" | "readability";

/** Existing app/store actions only: no second desktop, player or camera owner. */
export function runPortfolioAction(action: PortfolioAction | { projectId: string }): boolean {
  if (typeof action === "object") {
    const project = getProjectById(action.projectId);
    if (!project) return false;
    openPortfolioItem({ id: project.id, name: project.name, type: "file" });
  } else if (action === "projects") {
    openPortfolioItem({ id: "projects", name: "Projects", type: "folder" });
  } else if (action === "about") {
    openAboutMe();
  } else if (action === "contact") {
    useWindowStore.getState().openWindow({ id: "app-mail", kind: "mail", title: "Mail" });
    useMailStore.getState().openComposer();
  } else if (action === "readability") {
    useWindowStore.getState().openWindow({ id: "app-settings", kind: "settings", title: "Settings", settingsSection: "accessibility" });
  } else {
    useDisplayStore.getState().setScreenView(!useDisplayStore.getState().screenView);
  }
  return true;
}
