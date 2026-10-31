"use client";

import { useEffect, useState, type CSSProperties } from "react";

const PARTICLE_COUNT = 70;
const COLORS = ["#ff5f57", "#ffb454", "#34c759", "#4c8dff", "#8a5cf6", "#ffffff"];
const LIFETIME_MS = 2600;

// The same short confetti explosion works when the hand model uses CPU.
// CSS fragments avoid a second WebGL context competing with the laptop/model.
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, index) => {
  const angle = ((index * 37) % 360) * (Math.PI / 180);
  const speed = 1.5 + ((index * 17) % 25) / 10;
  const x = Math.cos(angle) * speed * 80;
  const rotation = 360 + ((index * 29) % 5) * 180;
  const delay = (index % 5) * 15;
  return {
    "--confetti-start-x": `${(((index * 13) % 20) / 20 - 0.5) * 32}px`,
    "--confetti-mid-x": `${x * 0.7}px`,
    "--confetti-end-x": `${x}px`,
    "--confetti-peak-y": `${-110 - ((index * 11) % 20) * 8}px`,
    "--confetti-end-y": `${120 + ((index * 19) % 20) * 10}px`,
    "--confetti-mid-rotation": `${rotation * 0.45}deg`,
    "--confetti-end-rotation": `${rotation}deg`,
    width: `${8 + index % 3}px`,
    height: `${4 + index % 2}px`,
    backgroundColor: COLORS[index % COLORS.length],
    animationDuration: `${LIFETIME_MS - delay}ms`,
    animationDelay: `${delay}ms`,
  } as CSSProperties;
});

export function ConfettiBurst() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = globalThis.setTimeout(() => setVisible(false), LIFETIME_MS);
    return () => globalThis.clearTimeout(id);
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      data-confetti-renderer="css"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      <style>{`
        @keyframes facetime-confetti-burst {
          0% { opacity: 0; transform: translate(var(--confetti-start-x), 0) rotate(0deg); }
          8% { opacity: 1; }
          45% { opacity: 0.85; transform: translate(var(--confetti-mid-x), var(--confetti-peak-y)) rotate(var(--confetti-mid-rotation)); }
          100% { opacity: 0; transform: translate(var(--confetti-end-x), var(--confetti-end-y)) rotate(var(--confetti-end-rotation)); }
        }
        .facetime-confetti-particle {
          position: absolute; left: 50%; top: 58%; opacity: 0;
          border-radius: 1px;
          animation-name: facetime-confetti-burst;
          animation-timing-function: cubic-bezier(0.2, 0.65, 0.4, 1);
          animation-fill-mode: both;
        }
        @media (prefers-reduced-motion: reduce) {
          .facetime-confetti-particle { animation: none; }
        }
      `}</style>
      {PARTICLES.map((style, index) => (
        <span key={index} data-confetti-particle className="facetime-confetti-particle" style={style} />
      ))}
    </div>
  );
}
