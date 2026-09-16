"use client";

/**
 * <GameMenu/> + <HiddenGameTrigger/> + useGameMenuKeyboardTrigger()
 * npm install framer-motion lucide-react
 *
 * Usage inside your real <AboutMeWindow/>:
 *
 *   const [gameMenuOpen, setGameMenuOpen] = useState(false);
 *   useGameMenuKeyboardTrigger(() => setGameMenuOpen(true));
 *   ...
 *   <p>...enjoy building things in my free time <HiddenGameTrigger onActivate={() => setGameMenuOpen(true)} />...</p>
 *   ...
 *   <GameMenu open={gameMenuOpen} onClose={() => setGameMenuOpen(false)} />
 *
 * The tiles are wired up (onLaunch fires with the game id) but the actual
 * mini-games aren't built here — that's <MiniGame/>, a separate task.
 */

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gamepad2, X } from "lucide-react";
import styles from "./GameMenu.module.css";

// --- Hidden trigger: drop this inline inside About Me body text ---

interface HiddenGameTriggerProps {
  onActivate: () => void;
}

export function HiddenGameTrigger({ onActivate }: HiddenGameTriggerProps) {
  return (
    <button type="button" className={styles.hiddenTrigger} onClick={onActivate} aria-label="???">
      <Gamepad2 size={13} strokeWidth={2} />
    </button>
  );
}

// --- Optional keyboard trigger: typing "game" anywhere on the page ---

export function useGameMenuKeyboardTrigger(onActivate: () => void, word = "game") {
  const bufferRef = useRef("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.length !== 1) return; // ignore modifier/navigation keys
      bufferRef.current = (bufferRef.current + e.key.toLowerCase()).slice(-word.length);
      if (bufferRef.current === word) {
        bufferRef.current = "";
        onActivate();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onActivate, word]);
}

// --- The menu itself ---

interface GameTile {
  id: string;
  title: string;
  tagline: string;
  className: string;
}

// Original names + original CSS art, thematically inspired rather than a
// reproduction of either game's actual logo/branding — this ships to a
// public site, not just a private mockup.
const GAMES: GameTile[] = [
  { id: "block-rush", title: "Block Rush", tagline: "Sandbox building, Roblox-inspired", className: "tileBlocks" },
  { id: "kingdom-siege", title: "Kingdom Siege", tagline: "Medieval strategy, Kingshot-inspired", className: "tileSiege" },
];

interface GameMenuProps {
  open: boolean;
  onClose: () => void;
  onLaunch?: (id: string) => void;
}

export function GameMenu({ open, onClose, onLaunch }: GameMenuProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Blurs and dims the whole macOS desktop behind it, not just the About Me window */}
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            onClick={onClose}
          />

          <motion.div
            className={styles.panel}
            role="dialog"
            aria-label="Arcade"
            initial={{ transform: "scale(0.95) translateY(16px)", opacity: 0 }}
            animate={{ transform: "scale(1) translateY(0px)", opacity: 1 }}
            exit={{ transform: "scale(0.95) translateY(16px)", opacity: 0 }}
            transition={{ type: "spring", duration: 0.45, bounce: 0 }}
          >
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Arcade</span>
              <button className={styles.closeButton} onClick={onClose} aria-label="Close">
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            <div className={styles.tileGrid}>
              {GAMES.map((game, i) => (
                <motion.button
                  key={game.id}
                  type="button"
                  className={`${styles.tile} ${styles[game.className]}`}
                  onClick={() => onLaunch?.(game.id)}
                  initial={{ transform: "scale(0.95) translateY(10px)", opacity: 0 }}
                  animate={{ transform: "scale(1) translateY(0px)", opacity: 1 }}
                  transition={{
                    type: "spring",
                    duration: 0.4,
                    bounce: 0,
                    delay: 0.08 + i * 0.05, // staggered 50ms apart, inside the 30–60ms band, after the panel's own entrance
                  }}
                  whileHover={{ transform: "scale(1.03) translateY(-2px)" }}
                  whileTap={{ transform: "scale(0.97) translateY(0px)" }}
                >
                  <div className={styles.tileArt} aria-hidden="true" />
                  <div className={styles.tileLabel}>
                    <span className={styles.tileTitle}>{game.title}</span>
                    <span className={styles.tileTagline}>{game.tagline}</span>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
