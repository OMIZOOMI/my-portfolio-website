"use client";

/**
 * <BootSequence/>
 *
 * Deep-black boot screen: spinner -> "Hello" -> morph to "Namaste" -> wake up
 * into the desktop rendered as `children`.
 *
 * npm install gsap @gsap/react
 */

import { useRef, useState, useEffect, type ReactNode } from "react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { useGSAP } from "@gsap/react";
import styles from "./BootSequence.module.css";

gsap.registerPlugin(CustomEase, useGSAP);

// Curves come straight from the design-system tokens — never hand-rolled.
CustomEase.create("easeOut", "0.23, 1, 0.32, 1"); // entrances / exits
CustomEase.create("easeInOut", "0.77, 0, 0.175, 1"); // on-screen morphs

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  return reduced;
}

interface BootSequenceProps {
  /** The desktop UI to reveal once the boot sequence finishes. */
  children?: ReactNode;
  /** Defaults to the Hello -> Namaste morph from the brief. */
  greetings?: [string, string];
  /** Fires once the overlay has fully faded and the desktop is interactive. */
  onComplete?: () => void;
}

export function BootSequence({
  children,
  greetings = ["Hello", "Namaste"],
  onComplete,
}: BootSequenceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const firstWordRef = useRef<HTMLSpanElement>(null);
  const secondWordRef = useRef<HTMLSpanElement>(null);

  const reduceMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      const handleDone = () => {
        // Fully drop the overlay out of the paint/interaction tree once invisible.
        gsap.set(overlayRef.current, { visibility: "hidden", pointerEvents: "none" });
        onComplete?.();
      };

      if (reduceMotion) {
        // Gentler equivalent: opacity-only, no scale/blur, shorter holds.
        const tl = gsap.timeline({
          defaults: { ease: "easeOut", duration: 0.25 },
          onComplete: handleDone,
        });

        tl.set(spinnerRef.current, { opacity: 0 })
          .set([firstWordRef.current, secondWordRef.current], { opacity: 0 })
          .set(overlayRef.current, { opacity: 1 })
          .set(contentRef.current, { opacity: 0 })
          .to(spinnerRef.current, { opacity: 1 })
          .to(spinnerRef.current, { opacity: 0 }, "+=0.5")
          .to(firstWordRef.current, { opacity: 1 }, "<")
          .to(firstWordRef.current, { opacity: 0 }, "+=0.7")
          .to(secondWordRef.current, { opacity: 1 }, "<")
          .to(overlayRef.current, { opacity: 0 }, "+=0.7")
          .to(contentRef.current, { opacity: 1 }, "<");

        return;
      }

      const tl = gsap.timeline({ defaults: { ease: "easeOut" }, onComplete: handleDone });

      tl
        // Initial state — never scale(0); start at 0.95/0.97 + opacity 0.
        .set(spinnerRef.current, { opacity: 0, scale: 0.95 })
        .set([firstWordRef.current, secondWordRef.current], {
          opacity: 0,
          scale: 0.97,
          filter: "blur(0px)",
        })
        .set(overlayRef.current, { opacity: 1, scale: 1 })
        .set(contentRef.current, { opacity: 0, scale: 0.95 })

        // Spinner entrance.
        .to(spinnerRef.current, { opacity: 1, scale: 1, duration: 0.4 })

        // Hold, then spinner -> "Hello" crossfade.
        .to(spinnerRef.current, { opacity: 0, scale: 0.97, duration: 0.3 }, "+=0.5")
        .to(firstWordRef.current, { opacity: 1, scale: 1, duration: 0.45 }, "<")

        // Morph "Hello" -> "Namaste": on-screen morph = ease-in-out,
        // masked with a brief blur pulse so the crossfade reads as one
        // transformation instead of two overlapping words.
        .to(
          firstWordRef.current,
          { opacity: 0, scale: 1.02, filter: "blur(6px)", duration: 0.5, ease: "easeInOut" },
          "+=0.9"
        )
        .to(
          secondWordRef.current,
          { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.5, ease: "easeInOut" },
          "<"
        )

        // Wake up: overlay pulls back and brightens away while the
        // desktop settles into place underneath, at the same moment.
        .to(
          overlayRef.current,
          { opacity: 0, scale: 1.05, duration: 0.8, pointerEvents: "none" },
          "+=0.8"
        )
        .to(contentRef.current, { opacity: 1, scale: 1, duration: 0.8 }, "<");
    },
    { scope: rootRef, dependencies: [reduceMotion] }
  );

  return (
    <div ref={rootRef} className={styles.root}>
      <div ref={contentRef} className={styles.content}>
        {children}
      </div>

      <div ref={overlayRef} className={styles.overlay}>
        <div className={styles.stage} aria-hidden="true">
          <div ref={spinnerRef} className={styles.spinner}>
            <svg viewBox="0 0 32 32" className={styles.spinnerSvg}>
              <circle cx="16" cy="16" r="13" className={styles.spinnerTrack} />
              <circle cx="16" cy="16" r="13" className={styles.spinnerArc} />
            </svg>
          </div>

          <div className={styles.greeting}>
            <span ref={firstWordRef} className={styles.greetingText}>
              {greetings[0]}
            </span>
            <span ref={secondWordRef} className={styles.greetingText}>
              {greetings[1]}
            </span>
          </div>
        </div>

        {/* Screen readers get one clean status update, not the decorative crossfade. */}
        <span role="status" aria-live="polite" className={styles.srOnly}>
          Loading portfolio…
        </span>
      </div>
    </div>
  );
}
