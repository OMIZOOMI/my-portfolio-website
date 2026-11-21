"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Cpu, Flame, Pause, Play, Snowflake, Trophy, Volume2, VolumeX, Zap } from "lucide-react";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useSystemStore } from "../window-manager/useSystemStore";
import { usePortfolioActivity } from "../portfolio/usePortfolioActivity";
import {
  advanceHeatSink, createHeatSink, HEAT_COLUMNS, HEAT_ROWS, HEAT_UPGRADES, HOT_TILE_HIT_HEAT,
  heatBatchMultiplier, heatBatchScore, heatCapacity, isOnHotTile, moveHeatSink, SCORE_PER_PRESSURE_LEVEL, startHeatSinkRun,
  type HeatDirection, type HeatSinkResult,
} from "./heatSinkEngine";
import { createHeatSinkAudio } from "./heatSinkAudio";
import { readHeatSinkProfile, recordHeatSinkScore, sanitizeHeatSinkInitials, updateHeatSinkSettings, writeHeatSinkProfile, type HeatSinkProfile } from "./heatSinkStorage";
import styles from "./HeatSinkApp.module.css";

type Phase = "ready" | "running" | "paused" | "ended";
type Feedback = { text: string; kind: "pickup" | "bank" | "record" | "heat-hit" | "upgrade"; id: number };
const BOARD = Array.from({ length: HEAT_COLUMNS * HEAT_ROWS }, (_, position) => ({ x: position % HEAT_COLUMNS, y: Math.floor(position / HEAT_COLUMNS) }));
const CONTROLS = [["left", ArrowLeft], ["up", ArrowUp], ["down", ArrowDown], ["right", ArrowRight]] as const;
const DIRECTIONS = new Map<string, HeatDirection>([["ArrowUp", "up"], ["w", "up"], ["ArrowLeft", "left"], ["a", "left"], ["ArrowDown", "down"], ["s", "down"], ["ArrowRight", "right"], ["d", "right"]]);
const prettyScore = (score: number) => score.toLocaleString("en-US");
const pointId = (point: { x: number; y: number }) => point.y * HEAT_COLUMNS + point.x;
const FIRST_REPEAT_MS = 185;
const REPEAT_MS = 122;
const CONFETTI_MS = 960;
const CONFETTI = Array.from({ length: 26 }, (_, index) => {
  const angle = index * Math.PI * (3 - Math.sqrt(5));
  const reach = 9 + (index * 7 % 13);
  return {
    "--burst-x": `${(Math.cos(angle) * reach).toFixed(2)}cqw`,
    "--burst-y": `${(Math.sin(angle) * reach * .65).toFixed(2)}cqw`,
    "--burst-turn": `${(index % 2 ? 1 : -1) * (200 + index * 13)}deg`,
    "--burst-delay": `${index % 4 * 16}ms`,
  } as CSSProperties;
});

export function HeatSinkApp({ window }: { window: { id: string } }) {
  const windowId = window.id;
  const reduced = useSystemStore(state => state.reduceMotion);
  const [profile, setProfile] = useState(readHeatSinkProfile);
  const [game, setGame] = useState(() => createHeatSink());
  const [phase, setPhase] = useState<Phase>("ready");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [newBest, setNewBest] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [launchCount, setLaunchCount] = useState(0);
  const profileRef = useRef(profile);
  const gameRef = useRef(game);
  const phaseRef = useRef<Phase>("ready");
  const moveAgain = useRef(0);
  const pressed = useRef(new Map<string, HeatDirection>());
  const feedbackCount = useRef(0);
  const audio = useRef<ReturnType<typeof createHeatSinkAudio> | null>(null);
  const controlArea = useRef<HTMLDivElement>(null);
  const mainAction = useRef<HTMLButtonElement>(null);
  const leaderboardHeading = useRef<HTMLHeadingElement>(null);
  const leaderboardButton = useRef<HTMLButtonElement>(null);
  const phaseFocus = useRef(false);
  const requestedLeaderboardFocus = useRef(false);

  const saveProfile = useCallback((next: HeatSinkProfile) => {
    profileRef.current = next;
    setProfile(next);
    setStorageAvailable(writeHeatSinkProfile(next));
  }, []);

  const getAudio = () => {
    if (!audio.current) {
      audio.current = createHeatSinkAudio();
      audio.current.setMuted(profileRef.current.muted);
    }
    return audio.current;
  };

  const setRunPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    pressed.current.clear();
    setPhase(next);
  }, []);

  const pause = useCallback((focusResume = false) => {
    if (phaseRef.current !== "running") return;
    phaseFocus.current = focusResume;
    audio.current?.silence();
    setCelebrating(false);
    setRunPhase("paused");
  }, [setRunPhase]);

  useEffect(() => {
    const checkActivity = () => {
      const state = useWindowStore.getState();
      const panel = state.windows[windowId];
      if (document.hidden || !usePortfolioActivity.getState().desktopActive || state.focusedWindowId !== windowId || panel?.minimized || panel?.closing || !panel) pause();
    };
    const blur = () => pause();
    const offWindow = useWindowStore.subscribe(checkActivity);
    const offDesktop = usePortfolioActivity.subscribe(checkActivity);
    document.addEventListener("visibilitychange", checkActivity);
    globalThis.addEventListener("blur", blur);
    globalThis.addEventListener("pagehide", blur);
    return () => {
      offWindow(); offDesktop();
      document.removeEventListener("visibilitychange", checkActivity);
      globalThis.removeEventListener("blur", blur);
      globalThis.removeEventListener("pagehide", blur);
      audio.current?.dispose();
      audio.current = null;
    };
  }, [pause, windowId]);

  useEffect(() => {
    if (!phaseFocus.current) return;
    phaseFocus.current = false;
    if (phase === "running") controlArea.current?.focus({ preventScroll: true });
    else if (!scoresOpen) mainAction.current?.focus({ preventScroll: true });
  }, [phase, scoresOpen]);

  useEffect(() => {
    if (!requestedLeaderboardFocus.current) return;
    requestedLeaderboardFocus.current = false;
    (scoresOpen ? leaderboardHeading.current : leaderboardButton.current)?.focus({ preventScroll: true });
  }, [scoresOpen]);

  useEffect(() => {
    if (!celebrating) return;
    const timer = globalThis.setTimeout(() => setCelebrating(false), CONFETTI_MS);
    return () => globalThis.clearTimeout(timer);
  }, [celebrating]);

  const applyResult = useCallback(({ state, event }: HeatSinkResult) => {
    if (phaseRef.current !== "running") return;
    const previousScore = gameRef.current.score;
    if (state !== gameRef.current) {
      gameRef.current = state;
      setGame(state);
    }
    if (!event) return;
    if (event.type === "move") audio.current?.play("move");
    if (event.type === "pickup") {
      setFeedback({ kind: "pickup", text: `${event.carried} ${event.carried === 1 ? "cell" : "cells"} carried`, id: ++feedbackCount.current });
      audio.current?.play("pickup", event.carried);
    }
    if (event.type === "bank") {
      const best = profileRef.current.best;
      const brokeRecord = previousScore <= best && state.score > best;
      setFeedback({ kind: brokeRecord ? "record" : "bank", text: `+${prettyScore(event.points)} banked${event.multiplier > 1 ? ` · ×${event.multiplier} batch` : ""}${event.cooled ? "" : " · Cooling recharging"}`, id: ++feedbackCount.current });
      if (brokeRecord) {
        setNewBest(true);
        setCelebrating(true);
      }
      audio.current?.play(brokeRecord ? "high-score" : event.multiplier > 1 ? "bonus" : "bank", event.batch);
    }
    if (event.type === "heat-hit") {
      setFeedback({ kind: "heat-hit", text: `Hot tile · +${HOT_TILE_HIT_HEAT}% heat`, id: ++feedbackCount.current });
      audio.current?.play("heat-hit");
    }
    if (event.type === "upgrade") {
      setFeedback({ kind: "upgrade", text: `${HEAT_UPGRADES[event.kind].name} equipped`, id: ++feedbackCount.current });
      audio.current?.play("upgrade");
    }
    if (event.type === "overheat") {
      setCelebrating(false);
      setFeedback(null);
      saveProfile(recordHeatSinkScore(profileRef.current, state.score));
      audio.current?.play("overheat");
      phaseFocus.current = true;
      setRunPhase("ended");
    }
  }, [saveProfile, setRunPhase]);

  const move = useCallback((direction: HeatDirection) => {
    if (phaseRef.current === "running") applyResult(moveHeatSink(gameRef.current, direction));
  }, [applyResult]);

  useEffect(() => {
    if (phase !== "running") return;
    let lastTick = performance.now();
    let request = 0;
    const tick = (now: number) => {
      if (phaseRef.current !== "running") return;
      const elapsed = now - lastTick;
      if (elapsed >= 50) {
        lastTick = now;
        applyResult(advanceHeatSink(gameRef.current, Math.min(200, elapsed)));
      }
      if (now >= moveAgain.current && pressed.current.size) {
        const direction = Array.from(pressed.current.values()).at(-1);
        if (direction) move(direction);
        moveAgain.current = now + REPEAT_MS;
      }
      if (phaseRef.current === "running") request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [applyResult, move, phase]);

  const begin = () => {
    const sounds = getAudio();
    sounds.unlock();
    sounds.silence();
    const next = startHeatSinkRun();
    gameRef.current = next;
    setGame(next);
    setLaunchCount(value => value + 1);
    setFeedback(null);
    setNewBest(false);
    setCelebrating(false);
    phaseFocus.current = true;
    setRunPhase("running");
    sounds.play("start");
  };
  const resume = () => {
    getAudio().unlock();
    phaseFocus.current = true;
    setRunPhase("running");
  };
  const openScores = () => {
    pause();
    requestedLeaderboardFocus.current = true;
    setScoresOpen(true);
  };
  const closeScores = () => {
    requestedLeaderboardFocus.current = true;
    setScoresOpen(false);
  };
  const toggleSounds = () => {
    const muted = !profileRef.current.muted;
    const sounds = getAudio();
    sounds.setMuted(muted);
    if (!muted) sounds.unlock();
    saveProfile(updateHeatSinkSettings(profileRef.current, { muted }));
  };

  const press = (id: string, direction: HeatDirection, timestamp: number) => {
    if (phaseRef.current !== "running" || pressed.current.has(id)) return;
    getAudio().unlock();
    pressed.current.set(id, direction);
    moveAgain.current = timestamp + FIRST_REPEAT_MS;
    move(direction);
  };

  const gameKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || (event.target instanceof HTMLElement && event.target.closest("input"))) return;
    const direction = DIRECTIONS.get(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    if (direction && phaseRef.current === "running") {
      event.preventDefault(); event.stopPropagation();
      press(`key-${event.code}`, direction, event.timeStamp);
    } else if (event.key === "Escape" && phaseRef.current === "running") {
      event.preventDefault(); event.stopPropagation(); pause(true);
    }
  };

  const buttonDown = (event: PointerEvent<HTMLButtonElement>, direction: HeatDirection) => {
    if (!event.isPrimary || event.button !== 0 || phaseRef.current !== "running") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    press(`pointer-${event.pointerId}`, direction, event.timeStamp);
  };
  const buttonUp = (event: PointerEvent<HTMLButtonElement>) => { pressed.current.delete(`pointer-${event.pointerId}`); };

  const cells = new Set(game.cells.map(pointId));
  const hazards = new Map(game.hazards.map(hazard => [pointId(hazard), hazard.status]));
  const stationed = pointId(game.station);
  const drop = game.upgradeDrop;
  const dropTile = drop ? pointId(drop) : null;
  const displayedUpgrade = game.upgrade ?? drop?.kind;
  const upgrade = displayedUpgrade ? HEAT_UPGRADES[displayedUpgrade] : null;
  const position = { "--x": game.player.x, "--y": game.player.y } as CSSProperties;
  const heat = Math.floor(game.heat);
  const hot = isOnHotTile(game);
  const secondsToCooling = Math.max(0, game.stationReadyAtMs - game.elapsedMs) / 1000;
  const coolingReady = secondsToCooling === 0;
  const hitFade = game.lastHeatHitAtMs === null ? 0 : Math.max(0, 1 - (game.elapsedMs - game.lastHeatHitAtMs) / 950);
  const tint = scoresOpen ? 0 : phase === "running" ? Math.max(hot ? .58 : 0, hitFade * .8) : phase === "ended" && hot ? .58 : 0;
  const readyMessage = hot ? "Hot tile · Heat rising twice as fast" :
    feedback?.kind === "heat-hit" && !hitFade ? "Arrow keys or WASD to move" : feedback?.text ?? "Arrow keys or WASD to move";
  const last = profile.last ? prettyScore(profile.last.score) : "—";
  const bankValue = heatBatchScore(game.carried);

  return <div className={styles.app} data-heat-sink data-heat-phase={phase} data-reduced-motion={reduced || undefined}>
    <div className={styles.viewport}>
    <div className={styles.shell}>
      <header className={styles.masthead}>
        <div className={styles.signature}><span className={styles.stamp}><Cpu size={21} aria-hidden="true" /></span><div><span className={styles.kicker}>Om’s arcade</span><h1>Heat Sink</h1></div></div>
        <div className={styles.toolbar}>
          <button type="button" className={styles.button} onClick={toggleSounds} aria-pressed={!profile.muted} aria-label="Game sound">{profile.muted ? <VolumeX size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}<span>{profile.muted ? "Muted" : "Sound"}</span></button>
          <button type="button" ref={leaderboardButton} className={styles.button} onClick={scoresOpen ? closeScores : openScores} aria-expanded={scoresOpen}><Trophy size={15} aria-hidden="true" />{scoresOpen ? "Back to game" : "Top 10"}</button>
          {phase === "running" && !scoresOpen && <button type="button" className={styles.button} onClick={() => pause(true)}><Pause size={15} aria-hidden="true" />Pause</button>}
        </div>
      </header>

      {scoresOpen ? <section className={styles.scores} aria-labelledby={`${windowId}-scores`}>
        <h2 ref={leaderboardHeading} tabIndex={-1} id={`${windowId}-scores`}>Top 10</h2>
        <p>{storageAvailable ? "Scores are stored on this browser. Take turns and leave your initials." : "Browser storage is unavailable. Scores are kept for this visit only."}</p>
        <table className={styles.scoreTable}><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Score</th></tr></thead>
          <tbody>{profile.entries.length ? profile.entries.map((entry, rank) => <tr key={`${entry.at}-${rank}`} data-best={rank === 0 || undefined}><td>{String(rank + 1).padStart(2, "0")}</td><td>{entry.initials || "—"}</td><td>{prettyScore(entry.score)}</td></tr>) : <tr><td colSpan={3}>No runs yet. Set the first score.</td></tr>}</tbody>
        </table>
        <div className={styles.scoreFooter}><button type="button" className={styles.button} onClick={closeScores}>Back to Heat Sink</button></div>
      </section> : <div className={styles.layout}>
        <div ref={controlArea} className={styles.game} tabIndex={0} data-heat-controls aria-label="Heat Sink playfield. Arrow keys or W A S D to move. Escape to pause."
          onKeyDown={gameKey} onKeyUp={event => { pressed.current.delete(`key-${event.code}`); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) pressed.current.clear(); }}>
          <div className={styles.chassis}>
            <div className={styles.field} data-heat-board data-feedback={feedback?.kind} style={{ "--columns": HEAT_COLUMNS, "--rows": HEAT_ROWS } as CSSProperties}>
              <div className={styles.grid} aria-hidden="true">
                {BOARD.map((point, index) => <div key={index} className={styles.tile} data-heat-tile={`${point.x},${point.y}`} data-terrain={hazards.get(index)} data-station={stationed === index || undefined} data-recharging={stationed === index && !coolingReady || undefined}>
                  {index === stationed && <Snowflake className={styles.stationMark} strokeWidth={1.7} />}
                  {cells.has(index) && <span className={styles.core} data-heat-cell />}
                  {dropTile === index && <span className={styles.upgradeTile} data-heat-upgrade={drop?.kind}><Zap strokeWidth={2.4} /></span>}
                </div>)}
                <div className={styles.player} style={position} key={launchCount} data-heat-player={`${game.player.x},${game.player.y}`}>
                  <span key={feedback?.id ?? "chip"} className={styles.chip} data-hot={hot || heat >= 76 || undefined}><Cpu strokeWidth={1.85} /></span>
                </div>
              </div>
              {celebrating && <div className={styles.confetti} data-heat-confetti aria-hidden="true"
                style={{ "--station-x": game.station.x, "--station-y": game.station.y } as CSSProperties}>
                {CONFETTI.map((piece, index) => <i key={index} style={piece} />)}
              </div>}
              {phase !== "running" && <div className={styles.cover}>
                <section className={styles.card} aria-label={phase === "ended" ? "Run results" : undefined}>
                  <span className={styles.kicker}>{phase === "ended" ? newBest ? "New high score" : "Run complete" : phase === "paused" ? "Run suspended" : "Survival arcade"}</span>
                  <h2>{phase === "paused" ? "Paused" : phase === "ended" ? "Overheated" : "How far will you push it?"}</h2>
                  <p>{phase === "paused" ? "Your score, cells, and heat are held here." : phase === "ended" ? `${prettyScore(game.score)} banked points. Cells you were still carrying don’t count.` : "Bring amber cells to the blue station. Bigger batches score more. The higher you score, the hotter the board gets."}</p>
                  {phase !== "paused" && <label className={styles.callSign}>{phase === "ready" ? "Initials" : "Next run initials"} <input aria-label="Leaderboard initials" placeholder="ABC" maxLength={3} autoComplete="off" spellCheck={false} value={profile.initials} onChange={event => saveProfile(updateHeatSinkSettings(profileRef.current, { initials: sanitizeHeatSinkInitials(event.target.value) }))} /><span>Optional</span></label>}
                  <div className={styles.cardActions}>
                    <button type="button" ref={mainAction} className={`${styles.button} ${styles.primary}`} onClick={phase === "paused" ? resume : begin}><Play size={15} aria-hidden="true" />{phase === "paused" ? "Resume run" : phase === "ended" ? "Play again" : "Start run"}</button>
                    {phase === "ended" && <button type="button" className={styles.button} onClick={openScores}>View scores</button>}
                  </div>
                </section>
              </div>}
            </div>
          </div>
          <div className={styles.underboard}>
            <p className={styles.status} data-hot={phase === "running" && hot || undefined}>{phase === "running" ? readyMessage : "Arrow keys or WASD to move"}</p>
            <div className={styles.dpad} role="group" aria-label="Movement controls">
              {CONTROLS.map(([direction, Icon]) => <button key={direction} type="button" className={`${styles.button} ${styles.direction}`} disabled={phase !== "running"} aria-label={`Move ${direction}`}
                onPointerDown={event => buttonDown(event, direction)} onPointerUp={buttonUp} onPointerCancel={buttonUp} onLostPointerCapture={buttonUp}
                onClick={event => { if (event.detail === 0) { getAudio().unlock(); move(direction); } }}><Icon size={17} aria-hidden="true" /></button>)}
            </div>
          </div>
        </div>
        <aside className={styles.sidebar} aria-label="Run status">
          <section className={styles.meterBox} data-danger={hot || heat >= 76 || undefined}>
            <header><span className={styles.kicker}>Core heat</span><strong data-heat-temperature>{heat}%</strong></header>
            <div className={styles.heatTrack} role="meter" aria-label="Core heat" aria-valuemin={0} aria-valuemax={100} aria-valuenow={heat}><div className={styles.heatFill} style={{ transform: `scaleX(${heat / 100})` }} /></div>
            <div className={styles.cargo}><span>Cells carried</span><strong data-heat-carried>{game.carried}/{heatCapacity(game.upgrade)}</strong></div>
            <div className={styles.cooling}><Snowflake size={12} aria-hidden="true" /><span>{coolingReady ? "Cooling ready" : `Recharging · ${Math.ceil(secondsToCooling * 10) / 10}s`}</span></div>
          </section>
          <section className={styles.scoreBox}>
            <span className={styles.kicker}>Banked</span><strong className={styles.scoreValue} data-heat-score>{prettyScore(game.score)}</strong>
            {newBest && <p className={styles.record} data-heat-record><Trophy size={13} aria-hidden="true" /> New high score</p>}
            <div className={styles.scoreLine}><span>Best</span><span>{prettyScore(Math.max(profile.best, game.score))}</span></div>
            <div className={styles.scoreLine}><span>Last</span><span>{last}</span></div>
            <div className={styles.scoreLine}><span>Pressure</span><span data-heat-level>{game.level}</span></div>
            {bankValue > 0 && <div className={styles.scoreLine}><span>Cargo ×{heatBatchMultiplier(game.carried)}</span><span>{prettyScore(bankValue)}</span></div>}
          </section>
          {upgrade && <section className={styles.upgradeBox} aria-label="Run upgrade">
            <span className={styles.kicker}>{drop ? "Upgrade on board" : "Upgrade equipped"}</span>
            <strong>{upgrade.name}</strong>
            <p>{upgrade.benefit} · +{Math.round((upgrade.heatMultiplier - 1) * 100)}% heat</p>
          </section>}
          <div className={styles.instructions}>
            <span className={styles.kicker}><Flame size={12} aria-hidden="true" /> Field guide</span>
            <p>Pressure climbs every {SCORE_PER_PRESSURE_LEVEL} banked points. Red tiles give a heat spike and double heating while you stand on them.</p>
            <p>Bank anytime on blue. Cooling needs time to recharge. Collect a rare bolt to equip an upgrade for this run.</p>
          </div>
        </aside>
        <span className="sr-only" role="status">{feedback?.kind === "record" && "New high score! "}{feedback && feedback.kind !== "pickup" ? feedback.text : ""}</span>
      </div>}
    </div>
    </div>
    <div className={styles.hitWash} data-heat-hit={tint > 0 || undefined} aria-hidden="true" style={{ "--hit-strength": tint } as CSSProperties} />
  </div>;
}
