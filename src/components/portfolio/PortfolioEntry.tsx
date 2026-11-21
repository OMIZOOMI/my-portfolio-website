"use client";

import { GlassButton } from "../ui/PortfolioGlass";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { DesktopEnvironment } from "../desktop/DesktopEnvironment";
import { PortfolioNavigationContext } from "./PortfolioDesktopAction";
import { runPortfolioAction, type PortfolioAction } from "./portfolioActions";
import styles from "./PortfolioEntry.module.css";
import { PortfolioIntroduction } from "./PortfolioIntroduction";
import { PortfolioProjectEntry } from "./PortfolioProjectEntry";
import { useIntroductionStore } from "./useIntroductionStore";
import { useDisplayStore } from "../window-manager/useDisplayStore";
import { useSystemStore } from "../window-manager/useSystemStore";
import { useKeyboardSounds } from "../webcam/useKeyboardSounds";
import { useWorkspaceStore } from "../workspace/useWorkspaceStore";

const MacBookScene = dynamic(() => import("../webcam/MacBookScene").then(module => module.MacBookScene));

export function PortfolioEntry({ overview, active = true, compact = false }: { overview: ReactNode; active?: boolean; compact?: boolean }) {
  const [sceneAvailable, setSceneAvailable] = useState(false);
  const available = compact || sceneAvailable;
  const [initialOfferReady, setInitialOfferReady] = useState(false);
  const screenView = useDisplayStore(state => state.screenView);
  const displayHydrated = useDisplayStore(state => state.hydrated);
  const introductionStatus = useIntroductionStore(state => state.status);
  const welcomeVisible = !active || introductionStatus !== null || initialOfferReady;
  const introductionStorageAvailable = useIntroductionStore(state => state.storageAvailable);
  const keyboardSounds = useWorkspaceStore(state => state.hydrated && state.keyboardSounds);
  useKeyboardSounds(compact && active && keyboardSounds);
  const details = useRef<HTMLDetailsElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!compact) return;
    useSystemStore.getState().hydrateAppearance();
    useDisplayStore.getState().hydrate();
    useWorkspaceStore.getState().hydrate();
  }, [compact]);
  useLayoutEffect(() => {
    if (displayHydrated) document.documentElement.removeAttribute("data-portfolio-boot-view");
  }, [displayHydrated]);
  useEffect(() => {
    if (compact || !active || introductionStatus !== null) return;
    const timer = window.setTimeout(() => setInitialOfferReady(true), 2000);
    return () => window.clearTimeout(timer);
  }, [active, compact, introductionStatus]);
  const closeOverview = useCallback((returnFocus = false) => {
    const element = details.current;
    if (!element?.open) return;
    element.open = false;
    if (returnFocus) element.querySelector("summary")?.focus({ preventScroll: true });
  }, []);
  const open = useCallback((action: PortfolioAction | { projectId: string }) => {
    if (!available || !runPortfolioAction(action)) return;
    closeOverview();
  }, [available, closeOverview]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) closeOverview();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [closeOverview]);

  useEffect(() => {
    const openOverviewFromMenu = () => {
      const element = details.current;
      if (!element) return;
      element.open = true;
      window.requestAnimationFrame(() => element.querySelector("summary")?.focus({ preventScroll: true }));
    };
    window.addEventListener("portfolio:open-overview", openOverviewFromMenu);
    return () => window.removeEventListener("portfolio:open-overview", openOverviewFromMenu);
  }, []);

  return <PortfolioNavigationContext.Provider value={{ available, screenView, open }}>
    <div className={styles.shell} data-screen-view={compact || (displayHydrated && screenView) ? "true" : undefined}>
    {/* This scene stays in one position in the tree when the overview/view changes. */}
    {compact ? <DesktopEnvironment compact /> : <MacBookScene active={active} onDesktopAvailabilityChange={setSceneAvailable} introduction={
       <PortfolioIntroduction active={active} available={available} welcomeVisible={welcomeVisible} onOverview={() => {
        if (details.current) details.current.open = true;
        details.current?.querySelector("summary")?.focus({ preventScroll: true });
      }} />
    } />}
    <div ref={root} className={styles.root} data-portfolio-entry data-screen-view={compact || (displayHydrated && screenView) ? "true" : undefined}
      onKeyDown={event => {
        if (event.key === "Escape" && details.current?.open && !event.defaultPrevented) {
          event.preventDefault(); event.stopPropagation(); closeOverview(true);
        }
      }}>
      <Suspense fallback={null}><PortfolioProjectEntry active={active} available={available} open={open} /></Suspense>
      {!available && <GlassButton type="button" className={styles.fallbackOverview} onClick={() => {
        if (details.current) details.current.open = true;
        details.current?.querySelector("summary")?.focus({ preventScroll: true });
      }}>Read Om’s portfolio overview</GlassButton>}
      <details ref={details} className={styles.overview}>
        <summary className={styles.overviewSummary}>Open Om’s portfolio overview</summary>
        <div className={styles.overviewPanel} role="region" aria-label="Quick overview">
          <div className={styles.panelToolbar}>
            <p>Om’s portfolio, at a glance</p>
            <GlassButton type="button" onClick={() => closeOverview(true)} aria-label="Close Quick overview">Close <span aria-hidden="true">×</span></GlassButton>
          </div>
          {overview}
          <p id="portfolio-desktop-status" className={styles.desktopStatus} role="status">
            {available ? "The interactive desktop is ready to explore." : "The desktop isn’t ready. This overview, source links, and contact details are available now."}
          </p>
          {!compact && <div className={styles.replay}><GlassButton type="button" className={styles.secondaryButton} onClick={() => { closeOverview(); useIntroductionStore.getState().replay(); }}>Replay introduction</GlassButton>
            {!introductionStorageAvailable && <p className={styles.smallPrint} role="status">This browser could not save the introduction preference. It stays dismissed for this visit, but may return on reload.</p>}
          </div>}
        </div>
      </details>
    </div>
    </div>
  </PortfolioNavigationContext.Provider>;
}
