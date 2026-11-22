"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePortfolioActivity } from "./usePortfolioActivity";
import styles from "./PortfolioSiteShell.module.css";
import { registerPublicProjectNavigator } from "./publicProjectNavigation";
import { BootPrelude } from "../boot/BootPrelude";

// Public reading pages do not instantiate or request the desktop's scene assets.
const PortfolioEntry = dynamic(() => import("./PortfolioEntry").then(module => module.PortfolioEntry), { loading: BootPrelude });
const compactViewport = "(max-width: 767px), (pointer: coarse)";

function subscribeToViewport(change: () => void) {
  const query = window.matchMedia(compactViewport);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}

function getCompactViewport() { return window.matchMedia(compactViewport).matches; }
function getServerViewport() { return null; }

export function PortfolioSiteShell({ overview, reading }: { overview: ReactNode; reading: ReactNode }) {
  const home = usePathname() === "/";
  return <Suspense fallback={home ? <div className={styles.site}>{reading}</div> : null}>
    <PortfolioViews home={home} overview={overview} reading={reading} />
  </Suspense>;
}

function PortfolioViews({ home, overview, reading }: { home: boolean; overview: ReactNode; reading: ReactNode }) {
  const search = useSearchParams();
  const router = useRouter();
  const compact = useSyncExternalStore(subscribeToViewport, getCompactViewport, getServerViewport);
  const [firstHomeCompact, setFirstHomeCompact] = useState<boolean | null>(null);
  if (home && compact !== null && firstHomeCompact === null) setFirstHomeCompact(compact);

  const view = search.get("view");
  const wantsDesktop = view === "desktop" || (view !== "reading" && (search.has("project") || firstHomeCompact === false));
  const interactive = home && compact !== null && wantsDesktop;
  const readingActive = home && !interactive;
  const [desktop, setDesktop] = useState<{ compact: boolean } | null>(null);
  // Retain this one child after the first interactive visit. Route children may
  // change; the Canvas, projected HTML root and app owners keep their positions.
  if (interactive && !desktop) setDesktop({ compact });
  const readingView = useRef<HTMLDivElement>(null);
  const desktopView = useRef<HTMLElement>(null);
  const previousHomeView = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    usePortfolioActivity.getState().setDesktopActive(interactive);
  }, [interactive]);
  useLayoutEffect(() => {
    if (!home || compact === null) {
      previousHomeView.current = null;
      return;
    }
    if (previousHomeView.current !== null && previousHomeView.current !== interactive) {
      const destination = interactive ? desktopView.current : readingView.current?.querySelector<HTMLElement>("h1");
      destination?.focus({ preventScroll: true });
    }
    previousHomeView.current = interactive;
  }, [compact, home, interactive]);
  useLayoutEffect(() => registerPublicProjectNavigator(href => {
    if (window.location.pathname !== href || window.location.search || window.location.hash) router.push(href, { scroll: false });
  }), [router]);
  return <div className={styles.site} data-portfolio-route={interactive ? "desktop" : "reading"}>
    <div className={styles.readingSlot} ref={readingView} hidden={!readingActive}>{reading}</div>
    {desktop && <main ref={desktopView} tabIndex={-1} className={styles.desktop} aria-label="Interactive portfolio" aria-hidden={!interactive} inert={!interactive}>
      <PortfolioEntry overview={overview} active={interactive} compact={desktop.compact} />
    </main>}
  </div>;
}
