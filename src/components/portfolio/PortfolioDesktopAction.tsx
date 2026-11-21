"use client";

import { createContext, useContext } from "react";
import type { PortfolioAction } from "./portfolioActions";
import styles from "./PortfolioEntry.module.css";

export const PortfolioNavigationContext = createContext<{
  available: boolean;
  screenView: boolean;
  open: (action: PortfolioAction | { projectId: string }) => void;
}>({ available: false, screenView: false, open: () => {} });

export function PortfolioDesktopAction({ action, projectId, children }: {
  action?: PortfolioAction;
  projectId?: string;
  children: React.ReactNode;
}) {
  const navigation = useContext(PortfolioNavigationContext);
  return <button type="button" className={styles.secondaryButton} disabled={!navigation.available} data-introduction-screen-control={action === "screen" || undefined}
    aria-describedby={!navigation.available ? "portfolio-desktop-status" : undefined}
    onClick={() => navigation.open(projectId ? { projectId } : action ?? "projects")}>{action === "screen" && navigation.screenView ? "Exit Screen view" : children}</button>;
}
