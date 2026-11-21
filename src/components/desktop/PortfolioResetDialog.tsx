"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import styles from "./SettingsApp.module.css";

export function PortfolioResetDialog({ onCancel, onReset, returnFocus }: {
  onCancel: () => void;
  onReset: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    const trigger = returnFocus.current;
    element?.showModal();
    cancel.current?.focus({ preventScroll: true });
    return () => { if (element?.open) element.close(); trigger?.focus({ preventScroll: true }); };
  }, [returnFocus]);
  return <dialog ref={dialog} role="dialog" className={styles.resetDialog} aria-labelledby="portfolio-reset-title" aria-describedby="portfolio-reset-scope portfolio-reset-kept"
    onCancel={event => { event.preventDefault(); onCancel(); }}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <h2 id="portfolio-reset-title">Reset portfolio settings?</h2>
    <p id="portfolio-reset-scope">Restore this website’s theme, wallpaper, accent, Dock, motion options, text and icon sizes, default view, workspace, and keyboard sounds.</p>
    <p id="portfolio-reset-kept">Your notes, Mail drafts, folders, introduction status, and other saved data will be kept. Your current view and open apps stay open. This does not reset your device or reload the page.</p>
    <div className={styles.resetActions}>
      <button ref={cancel} type="button" onClick={onCancel}>Cancel</button>
      <button type="button" className={styles.confirmReset} onClick={onReset}>Reset portfolio settings</button>
    </div>
  </dialog>;
}
