"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useReducedMotion } from "framer-motion";
import { Terminal as TerminalIcon, ArrowUpRight } from "lucide-react";
import { TERMINAL_INTRO, TERMINAL_SUGGESTIONS, terminalResponse, type TerminalLine } from "../../data/terminalProfile";
import { useSystemStore } from "../window-manager/useSystemStore";
import { useWindowStore } from "../window-manager/useWindowStore";
import styles from "./TerminalApp.module.css";
import { useIntroductionStore } from "../portfolio/useIntroductionStore";
import { PORTFOLIO_PROFILE as profile } from "../../data/portfolioProfile";

interface Entry { id: number; command: string; lines: TerminalLine[] }

function Output({ lines, animate, paused, onProgress }: { lines: TerminalLine[]; animate: boolean; paused: boolean; onProgress: () => void }) {
  const length = lines.reduce((n, line) => n + line.text.length, 0);
  const [revealed, setRevealed] = useState(0);
  const progress = useRef(0);
  useEffect(() => {
    if (!animate || paused || progress.current >= length) return;
    const start = performance.now();
    const base = progress.current;
    const timer = window.setInterval(() => {
      const count = Math.min(length, base + Math.floor((performance.now() - start) / 3.5));
      progress.current = count;
      setRevealed(count);
      if (count >= length) window.clearInterval(timer);
    }, 32);
    return () => window.clearInterval(timer);
  }, [animate, length, paused]);
  useLayoutEffect(() => { onProgress(); }, [animate, onProgress, revealed]);
  return <div className={styles.output} data-terminal-output aria-busy={animate && revealed < length}>
    {lines.map((line, index) => {
      const preceding = lines.slice(0, index).reduce((n, previous) => n + previous.text.length, 0);
      const count = Math.max(0, Math.min((animate ? revealed : length) - preceding, line.text.length));
      if (!count) return null;
      const text = line.text.slice(0, count);
      return <p key={index} data-tone={line.tone}>{line.href ? <a href={line.href} target="_blank" rel="noopener noreferrer">{text}</a> : text}</p>;
    })}
    {animate && revealed < length && <span className={styles.streamCursor} aria-hidden="true" />}
  </div>;
}

export function TerminalApp({ window: win }: { window: { id: string; title: string; minimized?: boolean } }) {
  const introducing = useIntroductionStore(state => state.phase === "active" && state.step === "terminal");
  const showIntroHighlight = useWindowStore(state => introducing && state.focusedWindowId === win.id && !state.windows[win.id]?.closing);
  const [history, setHistory] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [streamingId, setStreamingId] = useState<number | null>(0);
  const [recall, setRecall] = useState(-1);
  const [draft, setDraft] = useState("");
  const sequence = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const followOutput = useRef(false);
  useLayoutEffect(() => {
    if (!introducing || !scroll.current) return;
    followOutput.current = false;
    scroll.current.scrollTop = 0;
  }, [introducing]);
  const motionSetting = useSystemStore(s => s.reduceMotion);
  const osReduced = useReducedMotion();
  const reduced = motionSetting || osReduced;
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const change = () => setPageVisible(document.visibilityState === "visible");
    change(); document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  const onProgress = useCallback(() => {
    const element = scroll.current;
    if (element && followOutput.current) element.scrollTop = element.scrollHeight;
  }, []);
  useEffect(() => {
    // The visitor-paced guide owns initial focus while it introduces Terminal.
    if (useIntroductionStore.getState().phase !== "active") inputRef.current?.focus({ preventScroll: true });
  }, []);
  const run = (raw: string) => {
    const command = raw.trim();
    if (!command) return;
    const clear = command.toLowerCase() === "clear";
    followOutput.current = !clear;
    if (clear) {
      setHistory([]);
      setStreamingId(null);
      if (scroll.current) scroll.current.scrollTop = 0;
    } else {
      const id = ++sequence.current;
      setHistory(previous => [...previous.slice(-59), { id, command, lines: terminalResponse(command) }]);
      setStreamingId(id);
    }
    setInput(""); setRecall(-1); setDraft("");
    inputRef.current?.focus({ preventScroll: true });
  };
  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") { event.preventDefault(); run(input); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setStreamingId(null); }
    else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (!history.length) return;
      if (recall === -1) setDraft(input);
      const next = Math.max(-1, Math.min(history.length - 1, recall + (event.key === "ArrowUp" ? 1 : -1)));
      setRecall(next); setInput(next < 0 ? draft : history[history.length - 1 - next].command);
    }
  };
  const animated = !reduced;
  const paused = !!win.minimized || !pageVisible;
  return <div className={styles.app} data-terminal-app>
    <header className={styles.header}><span><TerminalIcon size={14} />om / portfolio</span><span>Interactive profile<ArrowUpRight size={12} /></span></header>
    <div className={styles.suggestions} aria-label="Suggested terminal commands">{TERMINAL_SUGGESTIONS.map(command => {
      const label = command[0].toUpperCase() + command.slice(1);
      return <button key={command} type="button" data-terminal-suggestion={command} aria-label={`Show ${label}`} onClick={() => run(command)}>{label}<span aria-hidden="true">↵</span></button>;
    })}</div>
    <div ref={scroll} className={styles.scroll} data-terminal-transcript onScroll={event => { const el = event.currentTarget; followOutput.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 24; }}
      onClick={event => { const target = event.target as HTMLElement; if (!target.closest("a,button,input") && !window.getSelection()?.toString()) inputRef.current?.focus({ preventScroll: true }); }}>
      {introducing && <section className={styles.introduction} data-terminal-introduction aria-label="Meet Om">
        {showIntroHighlight && !win.minimized && <span className={styles.introductionHighlight} data-terminal-introduction-highlight aria-hidden="true" />}
        <h2>{profile.name}</h2><p>{profile.role}</p><p>{profile.education} Choose a button; commands are optional.</p>
        <div role="group" aria-label="Explore Om’s profile">{["Projects", "Skills", "About"].map(label => <button type="button" key={label} onClick={() => run(label.toLowerCase())}>{label}</button>)}</div>
      </section>}
      <div className={styles.welcome}><span className={styles.eyebrow}>A FEW LINES ABOUT THE PERSON BEHIND THE CODE</span>
        <Output lines={TERMINAL_INTRO} animate={animated && streamingId === 0} paused={paused} onProgress={onProgress} />
      </div>
      <div className={styles.history} role="log" aria-label="Terminal command history" aria-live="off">
        {history.map(entry => <section key={entry.id} className={styles.entry}>
          <div className={styles.command}><span aria-hidden="true">om ~ %</span><span>{entry.command}</span></div>
          <Output lines={entry.lines} animate={animated && streamingId === entry.id} paused={paused} onProgress={onProgress} />
        </section>)}
      </div>
    </div>
      <form className={styles.prompt} onSubmit={event => { event.preventDefault(); run(input); }}>
        <label htmlFor={`terminal-input-${win.id}`}>om <span>~ %</span></label>
        <input id={`terminal-input-${win.id}`} ref={inputRef} value={input} onChange={event => { setInput(event.target.value); setRecall(-1); }} onKeyDown={handleKey} maxLength={256} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label="Terminal command" placeholder="Try projects or skills" />
        <button type="submit" aria-label="Run command">↵</button>
      </form>
    <footer className={styles.footer}><span>Explore at your own pace.</span><button type="button" onClick={() => setStreamingId(null)}>Show now</button></footer>
  </div>;
}
