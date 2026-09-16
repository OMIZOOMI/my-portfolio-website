"use client";

import { useEffect, useState } from "react";

const LIKE_LIFETIME_MS = 2200;
const LIKE_COUNT = 6;
const LIKE_EMOJIS = ["👍", "💙", "👍", "✨", "👍", "💙"];

/**
 * <FloatingLikes/>
 * Rises a burst of thumbs-up/like emojis from the bottom of the stage and
 * removes itself when the animation finishes. Mount one per trigger with a
 * unique `burstKey` (same pattern as ConfettiBurst) — CSS animation, no deps.
 */
export function FloatingLikes({ burstKey }: { burstKey: number }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = globalThis.setTimeout(() => setVisible(false), LIKE_LIFETIME_MS);
    return () => globalThis.clearTimeout(id);
  }, [burstKey]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <style>{`
        @keyframes facetime-like-float {
          0% { transform: translateY(0) scale(0.6) rotate(0deg); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translateY(-340px) scale(1.25) rotate(12deg); opacity: 0; }
        }
      `}</style>
      {Array.from({ length: LIKE_COUNT }, (_, i) => {
        // Deterministic pseudo-random spread so SSR/first paint is stable.
        const left = 18 + ((i * 53) % 64);
        const delay = (i % 3) * 0.12;
        const size = 30 + ((i * 17) % 18);
        return (
          <span
            key={`${burstKey}-${i}`}
            style={{
              position: "absolute",
              bottom: "18%",
              left: `${left}%`,
              fontSize: `${size}px`,
              animation: `facetime-like-float 2s ease-out ${delay}s forwards`,
              filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
            }}
          >
            {LIKE_EMOJIS[i % LIKE_EMOJIS.length]}
          </span>
        );
      })}
    </div>
  );
}
