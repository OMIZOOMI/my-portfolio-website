"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownRight, Laptop } from "lucide-react";
import type { IntroductionStatus } from "../../data/introductionPreference";
import styles from "./PortfolioReading.module.css";
import { useIntroductionStore } from "./useIntroductionStore";

export function ReadingGuide() {
  const [open, setOpen] = useState(false);
  const status = useIntroductionStore(state => state.status);
  const storageAvailable = useIntroductionStore(state => state.storageAvailable);
  const button = useRef<HTMLButtonElement>(null);
  const contentId = useId();
  useEffect(() => { useIntroductionStore.getState().hydrate(); }, []);

  const finish = (result: IntroductionStatus) => {
    useIntroductionStore.getState().finishReadingGuide(result);
    setOpen(false);
    button.current?.focus({ preventScroll: true });
  };

  return <aside className={styles.guide} id="reading-guide" aria-labelledby="reading-guide-title">
    <p className={styles.laptopTip}><Laptop size={19} aria-hidden="true" /> <span>For the full 3D experience, use a laptop or desktop.</span></p>
    <h2 id="reading-guide-title">Quick guide</h2>
    <div className={styles.guideActions}>
      <button ref={button} type="button" className={styles.secondary} aria-controls={contentId} aria-expanded={open} onClick={() => setOpen(previous => !previous)}>
        {open ? "Hide guide" : status ? "Open guide" : "Show me around"}
      </button>
      {!status && !open && <button type="button" className={styles.quietButton} onClick={() => finish("skipped")}>Skip guide</button>}
    </div>
    <div id={contentId} hidden={!open}>
      <ul className={styles.guideLinks}>
        <li><a href="#reading-projects"><strong>Projects <ArrowDownRight size={16} aria-hidden="true" /></strong><span>Read the Veyra and Adobe case studies.</span></a></li>
        <li><a href="#reading-contact"><strong>Contact <ArrowDownRight size={16} aria-hidden="true" /></strong><span>Find my email, GitHub, and LinkedIn.</span></a></li>
        <li><Link href="/?view=desktop" prefetch={false} scroll={false} onClick={() => finish("completed")}><strong>Interactive desktop <ArrowDownRight size={16} aria-hidden="true" /></strong><span>Tap folders and apps to explore. Portfolio overview brings you back here.</span></Link></li>
      </ul>
      <button type="button" className={styles.quietButton} onClick={() => finish("completed")}>Done</button>
    </div>
    {status && !storageAvailable && <p role="status">Your browser couldn’t save this choice for your next visit.</p>}
  </aside>;
}
