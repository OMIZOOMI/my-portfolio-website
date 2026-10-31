"use client";

import { useCallback, useEffect, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronUp, MapPin, Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { WORKSPACES, getWorkspace, type WorkspaceId } from "../../data/workspaces";
import { useWorkspaceStore } from "./useWorkspaceStore";
import { WorkspaceMedia } from "./WorkspaceMedia";
import { EMPTY_WORKSPACE, WORKSPACE_TRAVEL_MS, workspaceTransition, type MotionStatus } from "./workspaceTransition";
import styles from "./WorkspaceEnvironment.module.css";
import { useKeyboardSounds } from "../webcam/useKeyboardSounds";

const CONTROL_IDLE_MS = 3000;

export function WorkspaceEnvironment({ sceneUsable, reduceMotion }: { sceneUsable: boolean; reduceMotion: boolean }) {
  const [state, dispatch] = useReducer(workspaceTransition, EMPTY_WORKSPACE);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [motionAttempt, setMotionAttempt] = useState(0);
  const [controlRevealed, setControlRevealed] = useState(true);
  const [pointerInside, setPointerInside] = useState(false);
  const hydrated = useWorkspaceStore((s) => s.hydrated);
  const keyboardSounds = useWorkspaceStore((s) => s.keyboardSounds);
  useKeyboardSounds(hydrated && sceneUsable && keyboardSounds);
  const menu = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const sequence = useRef(0);
  const initialized = useRef(false);
  const active = state.layers.find((layer) => layer.key === state.active);
  const incoming = state.layers.find((layer) => layer.key === state.incoming);
  const destination = state.queued ?? incoming ?? active;
  const current = getWorkspace(active?.id);
  const activeId = active?.id;
  const moving = !paused && !reduceMotion && pageVisible && sceneUsable;
  const animate = !paused && !reduceMotion && pageVisible;

  const choose = useCallback((id: WorkspaceId) => {
    dispatch({ type: "select", selection: { key: ++sequence.current, id } });
  }, []);
  const ready = useCallback((key: number) => dispatch({ type: "ready", key, animate }), [animate]);
  const failed = useCallback((key: number, message: string) => dispatch({ type: "failed", key, message }), []);
  const motion = useCallback((key: number, status: MotionStatus) => dispatch({ type: "motion", key, status }), []);

  useEffect(() => { useWorkspaceStore.getState().hydrate(); }, []);
  useEffect(() => {
    if (!hydrated || initialized.current) return;
    initialized.current = true;
    choose(useWorkspaceStore.getState().environment);
  }, [choose, hydrated]);
  useEffect(() => {
    if (activeId) useWorkspaceStore.getState().remember(activeId);
  }, [activeId]); // Save only a successfully displayed location.

  useEffect(() => {
    const visible = () => setPageVisible(document.visibilityState === "visible");
    const hidden = () => setPageVisible(false);
    visible();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pagehide", hidden);
    window.addEventListener("pageshow", visible);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pagehide", hidden);
      window.removeEventListener("pageshow", visible);
    };
  }, []);

  useEffect(() => {
    if (state.phase !== "travelling" || state.incoming === null) return;
    const key = state.incoming;
    if (!animate) { dispatch({ type: "finish", key }); return; }
    const timer = window.setTimeout(() => dispatch({ type: "finish", key }), WORKSPACE_TRAVEL_MS);
    return () => window.clearTimeout(timer);
  }, [animate, state.incoming, state.phase]);

  // Collapse only the idle launcher, never the picker or a control in use.
  // Keyboard focus also keeps its label visible through :focus-visible in CSS.
  useEffect(() => {
    if (!sceneUsable || menuOpen || pointerInside || !controlRevealed) return;
    const timer = window.setTimeout(() => setControlRevealed(false), CONTROL_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [controlRevealed, menuOpen, pointerInside, sceneUsable]);

  const closeMenu = useCallback((returnFocus = false) => {
    setMenuOpen(false);
    if (returnFocus) trigger.current?.focus();
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const initial = options.current.find((option) => option?.getAttribute("aria-checked") === "true") ?? options.current[0];
    initial?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) closeMenu();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeMenu(true); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [closeMenu, menuOpen]);

  const optionKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = options.current.findIndex((option) => option === document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? WORKSPACES.length - 1
      : (index + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1) + WORKSPACES.length) % WORKSPACES.length;
    options.current[next]?.focus();
    choose(WORKSPACES[next].id);
  };
  const status = state.error ? state.error.message
    : state.phase === "preparing" ? `Preparing ${getWorkspace(incoming?.id).name}…`
    : state.phase === "travelling" ? `Travelling to ${getWorkspace(incoming?.id).name}…`
    : active?.motion === "unavailable" ? "Motion unavailable. You can retry."
    : reduceMotion ? "Still images · reduced motion"
    : paused ? "Motion paused"
    : !pageVisible ? "Motion paused while away"
    : current.video && active?.motion === "playing" ? "A little change of scenery"
    : current.video && active?.motion === "starting" ? "Starting the view…" : "A little room to focus";

  return (
    <>
      <div className={styles.backdrop} aria-hidden="true" data-workspace-environment data-workspace-current={active?.id ?? ""} data-workspace-kind={current.kind} data-workspace-phase={state.phase} data-workspace-motion={moving ? "enabled" : "paused"}>
        {/* Travel supplies its own motion. Freeze decoded frames for this brief
            interval instead of decoding two moving backgrounds under the 3D scene. */}
        {state.layers.map((layer) => <WorkspaceMedia key={layer.key} workspace={getWorkspace(layer.id)} layerKey={layer.key} role={layer.key === state.active ? "active" : "incoming"} motionAllowed={moving && state.phase !== "travelling"} preferPoster={reduceMotion} attempt={motionAttempt} allowStillFallback={state.active === null} onReady={ready} onFailed={failed} onMotion={motion} />)}
        {state.phase === "travelling" && <svg key={state.incoming} className={styles.warp} viewBox="0 0 1000 1000" preserveAspectRatio="none" data-workspace-warp>
          <defs><linearGradient id="workspace-travel-light" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0"><stop offset="0" stopColor="#f4f0e6" stopOpacity="0" /><stop offset="0.65" stopColor="#f4f0e6" stopOpacity="0.6" /><stop offset="1" stopColor="#f4f0e6" stopOpacity="0" /></linearGradient></defs>
          <g stroke="url(#workspace-travel-light)" strokeLinecap="round" fill="none">
            {Array.from({ length: 18 }, (_, i) => {
              const x = 80 + (i * 137) % 580;
              const y = 28 + i * 55;
              return <path key={i} d={`M ${x} ${y} H ${x + 140 + (i * 83) % 320}`} strokeWidth={i % 3 ? 1 : 2} opacity={i % 2 ? 0.5 : 0.8} />;
            })}
          </g>
        </svg>}
        <div className={styles.vignette} />
      </div>

      {sceneUsable && <aside ref={menu} className={styles.selector} data-workspace-controls data-revealed={controlRevealed || undefined} data-open={menuOpen || undefined} data-reduced-motion={reduceMotion || paused || undefined}
        onPointerEnter={(event) => { if (event.pointerType !== "touch") { setPointerInside(true); setControlRevealed(true); } }}
        onPointerLeave={() => setPointerInside(false)}
        onFocusCapture={() => setControlRevealed(true)}>
        <button ref={trigger} type="button" className={styles.trigger} aria-label={`Workspace: ${active ? current.name : "choose a place"}`} aria-expanded={menuOpen} aria-controls="workspace-choices" aria-haspopup="dialog" onClick={() => { setControlRevealed(true); setMenuOpen((open) => !open); }} data-workspace-trigger>
          <MapPin size={17} strokeWidth={1.7} />
          <span className={styles.triggerText}><span>Workspace</span><strong>{active ? current.name : "Choose a place"}</strong></span>
          <ChevronUp size={13} className={styles.chevron} data-open={menuOpen || undefined} />
        </button>

        {menuOpen && <section className={styles.panel} id="workspace-choices" role="dialog" aria-label="Choose workspace" data-workspace-picker>
          <div className={styles.panelHeader}><div><h2>Your workspace</h2><p>Live views, stills, and quiet colors.</p></div><button type="button" className={styles.close} aria-label="Close workspace choices" onClick={() => closeMenu(true)}><X size={16} /></button></div>
          <div role="radiogroup" aria-label="Workspace backgrounds" className={styles.choices} onKeyDown={optionKey}>
            {([ ["motion", "Live views"], ["still", "Still images"], ["color", "Solid colors"] ] as const).map(([kind, label]) => <div key={kind} className={styles.group}>
              <h3>{label}</h3>
              <div className={`${styles.optionGrid} ${kind === "motion" ? styles.motionGrid : ""}`}>
                {WORKSPACES.filter((workspace) => workspace.kind === kind).map((workspace) => {
                  const index = WORKSPACES.indexOf(workspace);
                  return <button key={workspace.id} ref={(node) => { options.current[index] = node; }} type="button" role="radio" aria-checked={destination?.id === workspace.id} aria-label={`${workspace.name}: ${workspace.description}`} tabIndex={!destination || destination.id === workspace.id ? 0 : -1} className={`${styles.choice} ${kind === "color" ? styles.colorChoice : ""}`} onClick={() => choose(workspace.id)} data-workspace-option={workspace.id}>
                    {workspace.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={workspace.thumbnail} width={160} height={100} alt="" loading="eager" draggable={false} />
                    ) : <span className={styles.swatch} style={{ backgroundColor: workspace.color }} />}
                    <strong>{workspace.name}</strong>
                    <span className={styles.check}>{destination?.id === workspace.id && <Check size={12} strokeWidth={2.5} />}</span>
                  </button>;
                })}
              </div>
            </div>)}
          </div>
          <div className={styles.motionControls}>
            <button type="button" aria-label="Keyboard click sounds" aria-pressed={keyboardSounds} data-workspace-keyboard-sounds onClick={() => useWorkspaceStore.getState().setKeyboardSounds(!keyboardSounds)}>
              {keyboardSounds ? <Volume2 size={14} /> : <VolumeX size={14} />}<span>Key sounds {keyboardSounds ? "on" : "off"}</span>
            </button>
            <button type="button" onClick={() => { setPaused((value) => !value); setMotionAttempt((value) => value + 1); }} aria-pressed={paused} disabled={reduceMotion} data-workspace-pause>
              {paused ? <Play size={14} /> : <Pause size={14} />}<span>{paused ? "Resume motion" : "Pause motion"}</span>
            </button>
            {(state.error || active?.motion === "unavailable") && <button type="button" aria-label="Retry workspace" data-workspace-retry onClick={() => { if (state.error) choose(state.error.id); setMotionAttempt((value) => value + 1); }}><RotateCcw size={14} /><span>Retry</span></button>}
          </div>
          <p className={styles.status} role="status" aria-live="polite" data-workspace-status>{status}</p>
          <details className={styles.credits}><summary>Workspace credits</summary>{WORKSPACES.filter((workspace) => workspace.kind !== "color").map((workspace) => <p key={workspace.id}>{workspace.source ? <a href={workspace.source} target="_blank" rel="noreferrer">{workspace.name} · {workspace.credit}</a> : `${workspace.name} · ${workspace.credit}`}</p>)}<p><a href="https://github.com/tplai/kbsim" target="_blank" rel="noreferrer">Cream keyboard recordings · Thomas Lai</a>{" · "}<a href="/sounds/keyboard/LICENSE.txt" target="_blank" rel="noreferrer">MIT license</a></p></details>
        </section>}
      </aside>}
    </>
  );
}
