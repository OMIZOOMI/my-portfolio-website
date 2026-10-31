"use client";

/**
 * <BootSequence/>
 *
 * Quiet boot screen: "Hello" -> "Namaste", actual readiness progress -> wake up
 * into the scene mounted behind this HTML-only overlay.
 *
 * npm install gsap @gsap/react
 */

import { useRef, useState, useEffect } from "react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { useGSAP } from "@gsap/react";
import styles from "./Bootsequence.module.css";

gsap.registerPlugin(CustomEase, useGSAP);

// Curves come straight from the design-system tokens — never hand-rolled.
CustomEase.create("easeOut", "0.23, 1, 0.32, 1"); // entrances / exits
CustomEase.create("easeInOut", "0.77, 0, 0.175, 1"); // on-screen morphs

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  return reduced;
}

interface BootSequenceProps {
  /** Defaults to the Hello -> Namaste morph from the brief. */
  greetings?: [string, string];
  /** Fires once the overlay has fully faded and the desktop is interactive. */
  onComplete?: () => void;
  /** Reveal only after the critical scene has produced a usable frame. */
  ready?: boolean;
  /** Honest staged status shown while readiness is pending. */
  status?: string;
  /** Number of completed preparation steps (0–5), never a time estimate. */
  progress?: number;
  reduceMotion?: boolean;
  /** Keeps the loader actionable when the 3D path cannot recover. */
  error?: string | null;
  onRetry?: () => void;
  onUseFallback?: () => void;
}

export function BootSequence({
  greetings = ["Hello", "Namaste"],
  onComplete,
  ready = false,
  status = "Preparing the portfolio…",
  progress = 0,
  reduceMotion: reduceMotionSetting = false,
  error = null,
  onRetry,
  onUseFallback,
}: BootSequenceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const firstWordRef = useRef<HTMLSpanElement>(null);
  const secondWordRef = useRef<HTMLSpanElement>(null);
  const introTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const completedRef = useRef(false);
  const [dismissed, setDismissed] = useState(false);

  const prefersReducedMotion = usePrefersReducedMotion();
  const reduceMotion = reduceMotionSetting || prefersReducedMotion;

  useGSAP(
    () => {
      // A preference change after the handoff must not recreate the loader.
      if (completedRef.current || !rootRef.current) return;
      // The greeting is deliberately independent of readiness. It gives the
      // visitor something calm to see without imposing a timer on the scene.
      const tl = gsap.timeline({ defaults: { ease: "easeOut" } });
      introTimelineRef.current = tl;

      if (reduceMotion) {
        tl.set([firstWordRef.current, secondWordRef.current], { opacity: 0 })
          .set(secondWordRef.current, { opacity: 1 });
      } else {
        tl.set([firstWordRef.current, secondWordRef.current], { opacity: 0, scale: 0.97, filter: "blur(0px)" })
          .to(firstWordRef.current, { opacity: 1, scale: 1, duration: 0.35 })
          .to(firstWordRef.current, { opacity: 0, scale: 1.02, filter: "blur(4px)", duration: 0.35 }, "+=0.25")
          .to(secondWordRef.current, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.35 }, "<");
      }

      gsap.set(rootRef.current, { opacity: 1, scale: 1 });

      return () => {
        tl.kill();
        introTimelineRef.current = null;
      };
    },
    { scope: rootRef, dependencies: [reduceMotion], revertOnUpdate: true }
  );

  useEffect(() => {
    if (error) {
      completedRef.current = false;
      introTimelineRef.current?.kill();
      gsap.set(rootRef.current, { opacity: 1, scale: 1 });
      return;
    }
    if (!ready || completedRef.current) return;
    introTimelineRef.current?.kill();
    gsap.set(firstWordRef.current, { opacity: 0 });
    gsap.set(secondWordRef.current, { opacity: 1, scale: 1, filter: "blur(0px)" });

    const duration = reduceMotion ? 0.01 : 0.65;
    const tl = gsap.timeline({
      defaults: { ease: "easeOut" },
      onComplete: () => {
        completedRef.current = true;
        // Remove the entire opaque, full-screen root. Fading only its inner
        // overlay leaves a black layer above the separately mounted Canvas.
        setDismissed(true);
        onComplete?.();
      },
    });
    tl.to(rootRef.current, { opacity: 0, scale: reduceMotion ? 1 : 1.025, duration });

    return () => {
      tl.kill();
    };
  }, [error, onComplete, ready, reduceMotion]);

  // Errors can still display recovery above an already revealed scene. Retry
  // remounts this component with the scene's attempt key.
  if (dismissed && !error) return null;

  return (
    <div ref={rootRef} className={styles.root} data-startup-overlay data-state={error ? "error" : ready ? "revealing" : "loading"}>
      <div className={styles.overlay}>
        <div className={styles.stage}>
          <div className={styles.greeting} aria-hidden="true">
            <span ref={firstWordRef} className={styles.greetingText}>
              {greetings[0]}
            </span>
            <span ref={secondWordRef} className={styles.greetingText}>
              {greetings[1]}
            </span>
          </div>
          {!error && (
            <div className={styles.loading}>
              <div className={styles.progress} role="progressbar" aria-label="Opening Om’s portfolio" aria-valuemin={0} aria-valuemax={5} aria-valuenow={progress} aria-valuetext={`${progress} of 5 preparation steps complete`} data-startup-progress>
                <span className={styles.progressFill} style={{ width: `${progress * 20}%`, transition: reduceMotion ? "none" : undefined }} />
              </div>
              <p className={styles.status}>Loading Om’s portfolio</p>
            </div>
          )}
          {error && (
            <div className={styles.errorPanel} role="alert">
              <p className={styles.errorTitle}>The 3D workspace needs attention</p>
              <p className={styles.errorMessage}>{error}</p>
              <div className={styles.actions}>
                {onRetry && <button type="button" onClick={onRetry}>Retry 3D view</button>}
                {onUseFallback && <button type="button" className={styles.secondaryAction} onClick={onUseFallback}>Open flat desktop</button>}
              </div>
            </div>
          )}
        </div>

        {/* Screen readers get one clean status update, not the decorative crossfade. */}
        <span role="status" aria-live="polite" className={styles.srOnly}>
          {error ?? status}
        </span>
      </div>
    </div>
  );
}
