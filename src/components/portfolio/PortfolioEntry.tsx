"use client";

import { GlassButton } from "../ui/PortfolioGlass";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
import { BootPrelude } from "../boot/BootPrelude";
import { WorkspaceEnvironment } from "../workspace/WorkspaceEnvironment";

const MacBookScene = dynamic(() => import("../webcam/MacBookScene").then(module => module.MacBookScene), { loading: BootPrelude });

export function PortfolioEntry({ overview, active = true, compact = false }: { overview: ReactNode; active?: boolean; compact?: boolean }) {
  const [sceneAvailable, setSceneAvailable] = useState(false);
  const [projectionReady, setProjectionReady] = useState(false);
  const [desktopChromeReady, setDesktopChromeReady] = useState(false);
  const [backdropReady, setBackdropReady] = useState(false);
  const [desktopHost] = useState(() => {
    // PortfolioEntry is only mounted once the client has selected a desktop.
    if (compact || typeof document === "undefined") return null;
    const host = document.createElement("div");
    host.style.width = "100%";
    host.style.height = "100%";
    return host;
  });
  const [projectedSlot, setProjectedSlot] = useState<HTMLDivElement | null>(null);
  const [paintedSlot, setPaintedSlot] = useState<HTMLDivElement | null>(null);
  const flatSlot = useRef<HTMLDivElement>(null);
  const [initialOfferReady, setInitialOfferReady] = useState(false);
  const screenView = useDisplayStore(state => state.screenView);
  const displayHydrated = useDisplayStore(state => state.hydrated);
  const reduceMotion = useSystemStore(state => state.reduceMotion);
  const laptopRequested = !compact && displayHydrated && !screenView;
  const mountScene = laptopRequested || sceneAvailable;
  const inProjection = mountScene && projectionReady && !!projectedSlot;
  const loadingLaptop = laptopRequested && !sceneAvailable;
  const available = compact || (displayHydrated && !loadingLaptop);
  const introductionStatus = useIntroductionStore(state => state.status);
  const welcomeVisible = !active || introductionStatus !== null || initialOfferReady;
  const introductionStorageAvailable = useIntroductionStore(state => state.storageAvailable);
  const keyboardSounds = useWorkspaceStore(state => state.hydrated && state.keyboardSounds);
  useKeyboardSounds(compact && active && keyboardSounds);
  const details = useRef<HTMLDetailsElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    useSystemStore.getState().hydrateAppearance();
    useDisplayStore.getState().hydrate();
    useWorkspaceStore.getState().hydrate();
  }, []);
  useLayoutEffect(() => {
    const destination = inProjection ? projectedSlot : flatSlot.current;
    if (!desktopHost || !destination) return;
    if (desktopHost.parentElement !== destination) {
      const focus = document.activeElement;
      destination.append(desktopHost);
      if (focus instanceof HTMLElement && desktopHost.contains(focus)) focus.focus({ preventScroll: true });
    }
    if (!inProjection) return;
    // Leave a rendering opportunity after placing the live desktop in the
    // screen. Keep the still scenery and block interaction until the fade ends.
    let paintFrame = 0;
    const layoutFrame = requestAnimationFrame(() => {
      paintFrame = requestAnimationFrame(() => setPaintedSlot(destination));
    });
    return () => {
      cancelAnimationFrame(layoutFrame);
      cancelAnimationFrame(paintFrame);
    };
  }, [desktopHost, inProjection, projectedSlot]);
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
  const openScreenView = useCallback(() => {
    const tour = useIntroductionStore.getState();
    if (tour.phase === "active" && tour.step === "laptop") {
      useIntroductionStore.setState({ laptopAvailable: false });
      tour.next("laptop");
    } else useDisplayStore.getState().setScreenView(true);
  }, []);
  const chromeReady = useCallback(() => setDesktopChromeReady(true), []);
  const sceneryReady = useCallback(() => setBackdropReady(true), []);
  const open = useCallback((action: PortfolioAction | { projectId: string }) => {
    if (loadingLaptop) openScreenView();
    if (!runPortfolioAction(action)) return;
    closeOverview();
  }, [closeOverview, loadingLaptop, openScreenView]);

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

  const introduction = <PortfolioIntroduction active={active} available={available} welcomeVisible={welcomeVisible} onOverview={() => {
    if (details.current) details.current.open = true;
    details.current?.querySelector("summary")?.focus({ preventScroll: true });
  }} />;

  return <PortfolioNavigationContext.Provider value={{ available: compact || displayHydrated, screenView, open }}>
    <div className={styles.shell} data-screen-view={compact || (displayHydrated && screenView) ? "true" : undefined}>
    {compact ? <DesktopEnvironment compact /> : <>
      <WorkspaceEnvironment sceneUsable={available} reduceMotion={reduceMotion} loadScenery={mountScene}
        onBackdropSettled={sceneryReady} />
      <div ref={flatSlot} className={styles.flatSurface} hidden={inProjection} inert={loadingLaptop}
        data-screen-surface={inProjection ? undefined : ""} data-screen-view={inProjection ? undefined : "focused"} />
      {mountScene && <MacBookScene active={active} onDesktopAvailabilityChange={setSceneAvailable}
        onProjectionReadyChange={setProjectionReady} desktopPainted={inProjection && paintedSlot === projectedSlot}
        desktopChromeReady={desktopChromeReady} backdropReady={backdropReady} onUseScreenView={openScreenView}
        desktop={<div ref={setProjectedSlot} className="h-full w-full" />} />}
      {desktopHost && createPortal(<DesktopEnvironment introduction={introduction} onStartupChromeReady={chromeReady} />, desktopHost)}
    </>}
    <div ref={root} className={styles.root} data-portfolio-entry data-screen-view={compact || (displayHydrated && screenView) ? "true" : undefined}
      onKeyDown={event => {
        if (event.key === "Escape" && details.current?.open && !event.defaultPrevented) {
          event.preventDefault(); event.stopPropagation(); closeOverview(true);
        }
      }}>
      <Suspense fallback={null}><PortfolioProjectEntry active={active} available={available} open={open} /></Suspense>
      {loadingLaptop && <GlassButton type="button" className={styles.fallbackOverview}
        onClick={() => open("projects")}>View projects</GlassButton>}
      <details ref={details} className={styles.overview}>
        <summary className={styles.overviewSummary}>Om Sawkare <span>Portfolio overview</span></summary>
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
