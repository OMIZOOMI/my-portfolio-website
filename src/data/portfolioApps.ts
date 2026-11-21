import { APP_LABELS } from "./appIdentity";

export const APPS_FOLDER_ID = "game";

export const DOCK_APP_IDS = ["finder", "terminal", "notes", "mail", "safari", "music", "facetime", "settings"] as const;
export const PORTFOLIO_APP_IDS = ["heat-sink", ...DOCK_APP_IDS] as const;
export type PortfolioAppId = typeof PORTFOLIO_APP_IDS[number];

export function portfolioAppName(id: PortfolioAppId) {
  return id === "heat-sink" ? "Heat Sink" : APP_LABELS[id];
}

export function portfolioAppForFile(id: string): PortfolioAppId | undefined {
  return id === "Neural Block" ? "heat-sink" : PORTFOLIO_APP_IDS.find(appId => appId === id);
}
