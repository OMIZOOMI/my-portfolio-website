"use client";

import { GlassButton } from "../ui/PortfolioGlass";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PORTFOLIO_PROFILE as profile } from "../../data/portfolioProfile";
import { PROJECTS } from "../../data/projectsData";
import { useWindowStore } from "../window-manager/useWindowStore";
import { getWorkspaceControlsOffset, useDisplayStore } from "../window-manager/useDisplayStore";
import { useSystemStore } from "../window-manager/useSystemStore";
import { SAFARI_START_URL, useSafariStore } from "../desktop/useSafariStore";
import { DESKTOP_ICON_W } from "../desktop/desktopIconLayout";
import { runPortfolioAction } from "./portfolioActions";
import { INTRODUCTION_STEPS, useIntroductionStore, type IntroductionStep } from "./useIntroductionStore";
import { observeIntroductionTarget, type IntroductionTarget, type measureIntroductionTarget } from "./introductionTargets";
import { cursorPointFromTarget, cursorTransform, cursorTravelDuration, type CursorPoint } from "./introductionCursor";
import styles from "./PortfolioIntroduction.module.css";

const TITLES = { laptop: "The laptop workspace", screen: "More room to read", projects: "Start with the work", terminal: "A few lines about Om", contact: "Find Om online", finish: "Your preferred view" };
const TIPS: Partial<Record<IntroductionStep, string>> = {
  laptop: "Open Settings here to change the scenery, pause motion, or switch views.",
  screen: "Open Settings here to change the view or make text and icons larger.",
  projects: "Open Projects to explore my work.",
  terminal: "Use Projects, Skills, or About — no typing needed.",
  contact: "Mail, GitHub, and LinkedIn are here.",
};
const NEXT_LABELS = { laptop: "Next: Screen view", screen: "Next: Projects", projects: "Next: Terminal", terminal: "Next: Contact", contact: "Next: Choose a view", finish: "" };
const featured = PROJECTS.filter(project => project.featured);

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = (event: MediaQueryListEvent) => setReduced(event.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return reduced;
}

function openTerminal() {
  useWindowStore.getState().openWindow({ id: "app-terminal", kind: "terminal", title: "Terminal" });
}

function openProfiles() {
  useWindowStore.getState().openWindow({ id: "app-safari", kind: "safari", title: "Safari" });
  useSafariStore.getState().navigate(SAFARI_START_URL, "Start Page");
}

export function GuideCursor({ step, target, available, reduceMotion, clip }: {
  step: IntroductionStep;
  target: ReturnType<typeof measureIntroductionTarget>["target"];
  available: boolean;
  reduceMotion: boolean;
  clip?: IntroductionTarget | null;
}) {
  const cursor = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const previousPoint = useRef<CursorPoint | null>(null);
  const previousStep = useRef<IntroductionStep | null>(null);
  const viewportWidth = typeof window === "undefined" ? 1100 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const center = cursorPointFromTarget(target);
  const side = center && center.x > viewportWidth * .6 ? "left" : "right";
  const vertical = center && center.y > (clip ? clip.y + clip.height : viewportHeight) - 118 ? "above" : "below";

  useLayoutEffect(() => {
    const element = cursor.current;
    const point = cursorPointFromTarget(target);
    if (!element || !point || !available) {
      previousPoint.current = null;
      previousStep.current = null;
      return;
    }
    const samePoint = previousPoint.current?.x === point.x && previousPoint.current?.y === point.y;
    const stepChanged = previousPoint.current !== null && previousStep.current !== null && previousStep.current !== step;
    const box = tooltip.current;
    const panel = element.ownerDocument?.querySelector('[data-introduction-viewport] [data-introduction-panel]')?.getBoundingClientRect();
    if (box) {
      const left = side === "left" ? point.x - 8 - box.offsetWidth : point.x + 26;
      const top = vertical === "above" ? point.y - 8 - box.offsetHeight : point.y + 18;
      const right = left + box.offsetWidth, bottom = top + box.offsetHeight;
      const overlapsPanel = panel && left < panel.right && right > panel.left && top < panel.bottom && bottom > panel.top;
      const outsideClip = clip && (left < clip.x || top < clip.y || right > clip.x + clip.width || bottom > clip.y + clip.height);
      box.style.visibility = overlapsPanel || outsideClip ? "hidden" : "";
    }
    // A step render can briefly carry the previous measurement while its
    // observer takes the first reading. Keep the step transition pending so
    // the cursor travels once the new target is available.
    if (stepChanged && samePoint) return;
    let from = previousPoint.current;
    if (!from && !reduceMotion && (step === "laptop" || step === "screen") && typeof window !== "undefined") {
      const direction = point.x < window.innerWidth / 2 ? 1 : -1;
      from = { x: point.x + direction * Math.min(100, window.innerWidth / 4), y: Math.max(8, point.y - 85) };
      element.style.transitionDuration = "0ms";
      element.style.transform = cursorTransform(from);
      element.getBoundingClientRect();
    }
    const duration = cursorTravelDuration(from, point, stepChanged || !previousPoint.current, reduceMotion);
    element.style.transitionDuration = `${duration}ms`;
    element.style.transform = cursorTransform(point);
    element.dataset.cursorDuration = String(duration);
    previousPoint.current = point;
    previousStep.current = step;
  }, [available, clip, reduceMotion, side, step, target, vertical]);

  if (!available || !target || step === "finish") return null;
  return <div ref={cursor} className={styles.cursor} data-introduction-cursor data-cursor-side={side} data-cursor-vertical={vertical} data-reduced-motion={reduceMotion || undefined}
    aria-hidden="true">
    <div className={styles.cursorContent}>
      <svg className={styles.cursorIcon} viewBox="0 0 28 36" focusable="false">
        <path d="M3 2.5 24.5 22l-10.2.9 5.5 9.4-4.2 2.4-5.5-9.5-5.2 8.8Z" />
      </svg>
      <span ref={tooltip} className={styles.cursorTooltip}>{TIPS[step]}</span>
    </div>
  </div>;
}

function GuideStep({ step, available, laptopAvailable, heading }: { step: IntroductionStep; available: boolean; laptopAvailable: boolean; heading: ReactNode }) {
  const screenView = useDisplayStore(state => state.screenView);
  const terminal = useWindowStore(state => step === "terminal" ? Object.values(state.windows).find(window => window.kind === "terminal") : undefined);
  const terminalInFront = useWindowStore(state => !terminal || (!terminal.closing && !terminal.minimized && state.focusedWindowId === terminal.id));
  const prefersReducedMotion = usePrefersReducedMotion();
  const reduceMotion = useSystemStore(state => state.reduceMotion) || prefersReducedMotion;
  const body = useRef<HTMLDivElement>(null);
  const [measurement, setMeasurement] = useState<ReturnType<typeof measureIntroductionTarget>>({ desktopReady: false, target: null, terminalViewport: null });
  useLayoutEffect(() => { if (body.current) body.current.scrollTop = 0; }, [step]);
  useLayoutEffect(() => {
    // Only the active step observes moving targets. It owns no scene animation,
    // pointer listener, scroll lock, desktop mount or media resource.
    return observeIntroductionTarget(step, next => {
      setMeasurement(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    }, screenView);
  }, [available, step, screenView, terminal, terminalInFront]);
  const ready = available && measurement.desktopReady;
  const clip = step === "terminal" ? measurement.terminalViewport : null;
  const target = step === "finish" || (terminal && (!terminalInFront || !clip)) ? null : measurement.target;
  const clipPath = clip && typeof window !== "undefined" ? `inset(${clip.y}px ${window.innerWidth - clip.x - clip.width}px ${window.innerHeight - clip.y - clip.height}px ${clip.x}px)` : undefined;
  const visuals = <>
    {available && target && !terminal && <div className={styles.target} aria-hidden="true" data-introduction-highlight data-reduced-motion={reduceMotion || undefined}
      style={{ left: target.x, top: target.y, width: target.width, height: target.height }} />}
    <div className={styles.cursorViewport} style={{ clipPath }}>
      <GuideCursor step={step} target={target} available={available} reduceMotion={reduceMotion} clip={clip} />
    </div>
  </>;
  return <>
    {typeof document !== "undefined" && document.body ? createPortal(visuals, document.body) : visuals}
    <div ref={body} className={styles.stepBody}>
    {heading}
    {step === "laptop" && <p>{laptopAvailable ? "This is Laptop view. Open the gear at the bottom left to change the scenery, pause its motion, or change your display. Next, we’ll zoom back in." : "The 3D workspace is unavailable right now. You can keep exploring in Screen view."}</p>}
    {step === "screen" && <p>Screen view fills the page so text is easier to read. The same gear lets you change the view or enlarge text and icons. Your apps stay open when you switch.</p>}
    {step === "projects" && <><p>Open Projects to browse the work, or use the direct Veyra and Adobe actions below. Explore freely; this guide can wait.</p>
      <div className={styles.actions}><GlassButton type="button" disabled={!ready} onClick={() => runPortfolioAction("projects")}>Open projects</GlassButton>
        {featured.map(project => <GlassButton type="button" key={project.id} data-introduction-project={project.key} disabled={!ready} onClick={() => runPortfolioAction({ projectId: project.id })}>{project.key === "adobe" ? "Adobe case study" : project.name}</GlassButton>)}</div></>}
    {step === "terminal" && <><p>Terminal has real Projects, Skills, and About suggestions. Open it when you are ready; no command typing is required.</p>
      <div className={styles.actions}><GlassButton type="button" onClick={openTerminal}>Open Terminal</GlassButton></div>
      {ready && !terminal && !measurement.target && <p className={styles.hint}>Terminal is not available right now. You can skip this step or reopen it.</p>}</>}
    {step === "contact" && <><p>Use Mail to write to Om, or open Browser to find his GitHub and LinkedIn profiles.</p>
      <div className={styles.actions}><GlassButton type="button" onClick={() => runPortfolioAction("contact")}>Open Mail</GlassButton><GlassButton type="button" onClick={openProfiles}>Open GitHub &amp; LinkedIn</GlassButton></div></>}
    {step === "finish" && <><p>{laptopAvailable ? "You’ve seen both views. Choose how the portfolio should open next time. You can change it anytime in Settings." : "You can continue in Screen view. Laptop view is unavailable right now."}</p>
      <div className={styles.actions} data-introduction-finish><GlassButton type="button" disabled={!ready} onClick={() => useIntroductionStore.getState().finish("screen")}>Start in Screen view</GlassButton>{laptopAvailable && <GlassButton type="button" disabled={!ready} onClick={() => useIntroductionStore.getState().finish("laptop")}>Start in Laptop view</GlassButton>}</div></>}
    {!ready && <p className={styles.hint} role="status">{available ? "Waiting for the desktop view to settle…" : "The desktop is still getting ready. You can wait, read Quick overview, or skip."}</p>}
    </div>
    <nav className={styles.navigation} aria-label="Introduction steps" data-introduction-navigation>
      <GlassButton type="button" onClick={() => useIntroductionStore.getState().back(step)}>Back</GlassButton>
      {step !== "finish" && <GlassButton type="button" aria-label={NEXT_LABELS[step]} aria-disabled={!ready} onClick={() => { if (ready) useIntroductionStore.getState().next(step); }}>Next</GlassButton>}
    </nav>
  </>;
}

export function PortfolioIntroduction({ active, available, onOverview, welcomeVisible = true }: { active: boolean; available: boolean; onOverview: () => void; welcomeVisible?: boolean }) {
  const phase = useIntroductionStore(state => state.phase);
  const step = useIntroductionStore(state => state.step);
  const tourCanPreviewLaptop = useIntroductionStore(state => state.laptopAvailable);
  const storageAvailable = useIntroductionStore(state => state.storageAvailable);
  const interfaceScale = useDisplayStore(state => state.interfaceScale);
  const iconScale = useDisplayStore(state => state.iconScale);
  const dockSize = useSystemStore(state => state.dockSize);
  const prefersReducedMotion = usePrefersReducedMotion();
  const reduceMotion = useSystemStore(state => state.reduceMotion) || prefersReducedMotion;
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const previousPhase = useRef(phase);
  useEffect(() => { useIntroductionStore.getState().hydrate(); }, []);
  useEffect(() => {
    if (!active) useIntroductionStore.getState().skip();
  }, [active]);
  useEffect(() => {
    if (!active || (phase !== "welcome" && phase !== "active")) return;
    // Leaving/reloading an unfinished introduction counts as dismissal. Only
    // completed/skipped status is stored; no step, timing or window state.
    const dismiss = () => useIntroductionStore.getState().skip();
    window.addEventListener("pagehide", dismiss);
    return () => window.removeEventListener("pagehide", dismiss);
  }, [active, phase]);
  useLayoutEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (phase === "welcome" && previous === "dismissed") {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      heading.current?.focus({ preventScroll: true });
    } else if (phase === "active") {
      if (previous !== "active" && !returnFocus.current) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (previous !== "active" || step === "finish" || !document.activeElement?.closest('[data-introduction-navigation]')) heading.current?.focus({ preventScroll: true });
    } else if (phase === "dismissed" && (previous === "active" || previous === "welcome")) {
      if (active) {
        const trigger = returnFocus.current;
        if (trigger?.isConnected && !trigger.closest('[inert],[hidden],[aria-hidden="true"],[data-introduction-panel],details:not([open])') && trigger.getClientRects().length) trigger.focus({ preventScroll: true });
        // A closed <details> descendant can still report a client rectangle;
        // the browser then silently refuses focus. Check the actual result.
        if (!trigger || document.activeElement !== trigger) document.querySelector<HTMLElement>('[data-portfolio-entry] summary')?.focus({ preventScroll: true });
      }
      returnFocus.current = null;
    }
  }, [active, phase, step]);
  if (!active || (phase === "welcome" && (!available || !welcomeVisible)) || (phase !== "welcome" && phase !== "active")) return null;
  const steps: readonly IntroductionStep[] = tourCanPreviewLaptop === false ? INTRODUCTION_STEPS.filter(item => item !== "laptop") : INTRODUCTION_STEPS;
  const hasLaptop = tourCanPreviewLaptop !== false && typeof document !== "undefined" && !!document.querySelector('[data-screen-surface]');
  const title = <h2 ref={heading} id="portfolio-introduction-title" aria-describedby="portfolio-introduction-progress" tabIndex={-1}>{phase === "welcome" ? `Welcome. I’m ${profile.name}.` : TITLES[step]}</h2>;
  const storageNotice = !storageAvailable && <p className={styles.hint}>This browser cannot save the introduction preference. It stays dismissed for this visit, but may return after a reload.</p>;
  const panel = <section className={`${styles.guide} ${phase === "active" ? styles.activeGuide : ""}`} aria-labelledby="portfolio-introduction-title" data-introduction-panel data-introduction-phase={phase} data-introduction-step={step} data-reduced-motion={reduceMotion || undefined}
    onKeyDown={event => {
      if (event.key === "Escape" && !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault(); event.stopPropagation(); useIntroductionStore.getState().skip();
      }
    }}>
    <div className={styles.topline}><span id="portfolio-introduction-progress">{phase === "welcome" ? "A quick introduction · Your pace" : `Step ${steps.indexOf(step) + 1} of ${steps.length}`}</span>
      <GlassButton type="button" onClick={() => useIntroductionStore.getState().skip()}>{phase === "welcome" ? "Dismiss" : "Skip"}</GlassButton></div>
    {phase === "welcome" ? <>{title}<p>Hi, I’m {profile.name}. I build computer vision, AI workflows and backend systems. Welcome to my interactive portfolio.</p>
      <div className={styles.actions}>
        <GlassButton type="button" onClick={() => useIntroductionStore.getState().start(!!document.querySelector('[data-screen-surface]'))}>Take a tour</GlassButton>
        <GlassButton type="button" disabled={!available} onClick={() => { useIntroductionStore.getState().skip(); runPortfolioAction("projects"); }}>Explore projects</GlassButton>
      </div>{storageNotice}</>
       : <GuideStep step={step} available={available} laptopAvailable={hasLaptop} heading={<>{title}{storageNotice}</>} />}
    {phase === "active" && <div className={styles.bottomline}><GlassButton type="button" onClick={onOverview}>Quick overview</GlassButton></div>}
  </section>;
  if (phase !== "active" || typeof document === "undefined" || !document.body) return panel;
  return createPortal(<div className={styles.viewport} data-introduction-viewport style={{
    "--guide-scale": interfaceScale,
    "--guide-icon-clearance": `${(DESKTOP_ICON_W * iconScale + 28) * interfaceScale}px`,
    "--guide-dock-clearance": `${getWorkspaceControlsOffset(dockSize, interfaceScale)}px`,
  } as CSSProperties}>{panel}</div>, document.body);
}
