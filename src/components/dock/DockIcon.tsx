"use client";

import { useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useSpring,
  useTransform,
  useMotionTemplate,
  type MotionValue,
} from "framer-motion";
import type { LucideIcon } from "lucide-react";
import styles from "./Dock.module.css";

const MAGNIFY_RANGE = 150; // px of cursor influence on either side of the icon
const BASE_SCALE = 1;
const PEAK_SCALE = 1.5;
const PEAK_LIFT = -14; // px — grows upward, like the real macOS dock

// Apple's critically damped baseline (damping 1.0) — no overshoot while the
// magnification tracks the cursor. This IS the "resting state" spring.
const RESTING_SPRING = { type: "spring" as const, duration: 0.35, bounce: 0 };
// Bounce is reserved for the one momentum-carrying moment: releasing a click.
const RELEASE_SPRING = { type: "spring" as const, duration: 0.4, bounce: 0.2 };
const PRESS_TWEEN = { duration: 0.1, ease: [0.23, 1, 0.32, 1] as const };

interface DockIconProps {
  mouseX: MotionValue<number>;
  label: string;
  accent: string;
  Icon: LucideIcon;
  /** Shows the small under-icon dot real macOS uses for open apps. */
  isRunning?: boolean;
  onSelect?: () => void;
}

export function DockIcon({ mouseX, label, accent, Icon, isRunning = false, onSelect }: DockIconProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reduceMotion = useReducedMotion();

  // Distance between the cursor and this icon's own center — the official
  // Framer Motion "magnetic dock" pattern, adapted to animate `scale`
  // instead of `width`/`height` so it never leaves the GPU-safe property set.
  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return MAGNIFY_RANGE;
    return val - (bounds.left + bounds.width / 2);
  });

  const peakScale = reduceMotion ? BASE_SCALE : PEAK_SCALE;
  const peakLift = reduceMotion ? 0 : PEAK_LIFT;

  // Distance -> target scale/lift. Falls off to baseline outside the range,
  // which is what produces the neighboring-icon "ripple" for free.
  const targetScale = useTransform(distance, [-MAGNIFY_RANGE, 0, MAGNIFY_RANGE], [BASE_SCALE, peakScale, BASE_SCALE]);
  const targetLift = useTransform(distance, [-MAGNIFY_RANGE, 0, MAGNIFY_RANGE], [0, peakLift, 0]);

  // Smoothed with the critically damped spring. This is bound straight to
  // `style` via a motion template rather than the `animate` prop — it never
  // touches React state, so it stays off the main thread even while the
  // pointer is moving continuously.
  const scaleSpring = useSpring(targetScale, RESTING_SPRING);
  const liftSpring = useSpring(targetLift, RESTING_SPRING);
  const magnifyTransform = useMotionTemplate`scale(${scaleSpring}) translateY(${liftSpring}px)`;

  return (
    <div className={styles.slot}>
      <motion.div
        ref={ref}
        className={styles.iconWrap}
        style={{ transform: magnifyTransform }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
      >
        {/* Tooltip scales out of the icon it belongs to, never from thin air. */}
        <motion.span
          className={styles.tooltip}
          initial={{ transform: "scale(0.95) translateY(4px)", opacity: 0 }}
          animate={
            hovered
              ? { transform: "scale(1) translateY(0px)", opacity: 1 }
              : { transform: "scale(0.95) translateY(4px)", opacity: 0 }
          }
          transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
        >
          {label}
        </motion.span>

        {/* Discrete press/release layer — full transform string per spec,
            kept on a separate element so it never contends with the
            magnification layer above for the same `transform` property. */}
        <motion.button
          type="button"
          className={styles.iconButton}
          style={{ background: `linear-gradient(160deg, ${accent}, ${accent}CC)` }}
          animate={{
            transform: pressed ? "scale(0.88) translateY(2px)" : "scale(1) translateY(0px)",
          }}
          transition={pressed ? PRESS_TWEEN : RELEASE_SPRING}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          onClick={onSelect}
          aria-label={label}
        >
          <Icon size={22} strokeWidth={1.75} color="#fff" />
        </motion.button>

        <AnimatePresence>
          {isRunning && (
            <motion.span
              className={styles.runningDot}
              initial={{ transform: "scale(0.4)", opacity: 0 }}
              animate={{ transform: "scale(1)", opacity: 1 }}
              exit={{ transform: "scale(0.4)", opacity: 0 }}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              aria-hidden="true"
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}