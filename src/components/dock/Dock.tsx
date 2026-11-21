"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useSystemStore } from "../window-manager/useSystemStore";
import { focusPortfolioWindow, revealDockControl } from "../window-manager/windowFocus";
import styles from "./Dock.module.css";
import { appWindowTitle } from "../../data/appIdentity";
import { DOCK_APP_IDS, portfolioAppName } from "../../data/portfolioApps";
import { PORTFOLIO_APP_ARTWORK } from "../../data/portfolioAppArtwork";
import { openPortfolioApp } from "../desktop/visitorLaunchers";

import BinFullDark from "../../assets/Bin_Full_yrypldfXBR_icns-3aa31b35a7.png";
import BinEmptyDark from "../../assets/Empty_Bin_lVRgezRq9O_icns-9852c609a9.png";
import BinFullLight from "../../assets/Bin_Full_KtswXfzQ5b_icns-84dec9d369.png";
import BinEmptyLight from "../../assets/Bin_Empty_FL3A3BWzVE_icns-7500fa1e26.png";

export default function Dock() {
  const theme = useSystemStore((s) => s.theme);
  const trashItems = useSystemStore((s) => s.trashItems);
  const isDarkMode = theme === "dark";
  const isBinFull = trashItems.length > 0;
  const isTrashHover = useSystemStore((s) => s.dropTarget === "trash");
  const magnification = useSystemStore((s) => s.dockMagnification);
  const dockSize = useSystemStore((s) => s.dockSize);
  const motionSetting = useSystemStore((s) => s.reduceMotion);
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = motionSetting || prefersReducedMotion;

  // Base icon footprint (w-14) scaled by the Dock Size preference.
  const iconPx = Math.max(44, Math.round(56 * dockSize));
  const iconStyle = { width: `${iconPx}px`, height: `${iconPx}px` };
  const magnify = magnification && !reduceMotion
    ? { scale: 1.4, translateY: -10 }
    : { scale: 1, translateY: 0 };

  const windows = useWindowStore((s) => s.windows);
  const focusedWindowId = useWindowStore((s) => s.focusedWindowId);
  const restoreWindow = useWindowStore((s) => s.focusWindow);
  const minimizedWindows = Object.values(windows).filter((w) => w.minimized);


  const getBinIcon = () => {
     if (isDarkMode && isBinFull) return BinFullDark;
     if (isDarkMode && !isBinFull) return BinEmptyDark;
     if (!isDarkMode && isBinFull) return BinFullLight;
     return BinEmptyLight;
  };


  // Open the Bin window instead of auto-emptying
  const handleBinClick = () => {
    useWindowStore.getState().openWindow({
      id: "bin-window",
      kind: "bin",
      title: "Bin"
    });
    focusPortfolioWindow("bin-window");
  };

  return (
    <nav data-dock="true" aria-label="Dock" data-reduced-motion={reduceMotion || undefined} className="absolute bottom-4 w-full flex justify-center z-[9990] pointer-events-none">
      <div data-dock-surface className={`${styles.surface} flex items-end gap-2 px-3 py-2 rounded-2xl pointer-events-auto`}>
        
        {DOCK_APP_IDS.map(id => (
          <motion.button type="button" key={id} data-dock-app={id} aria-label={`Open ${portfolioAppName(id)}`} aria-current={windows[focusedWindowId ?? ""]?.kind === id ? "true" : undefined}
            whileHover={magnify} transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 20 }} className={styles.launcher}
            onFocus={event => revealDockControl(event.currentTarget)} onClick={() => focusPortfolioWindow(openPortfolioApp(id))}>
            <Image src={PORTFOLIO_APP_ARTWORK[id]} alt="" aria-hidden="true" width={iconPx} height={iconPx} loading="eager" draggable={false} style={iconStyle} className="drop-shadow-md pointer-events-none select-none object-contain" />
            <span aria-hidden="true" className={styles.launcherLabel}>
              {portfolioAppName(id)}
            </span>
          </motion.button>
        ))}

        <div aria-hidden="true" className="w-[1px] h-12 bg-white/30 mx-1 rounded-full"></div>

        {minimizedWindows.map((win) => (
          <motion.button type="button" key={win.id} data-dock-minimized-window={win.id} aria-label={`Restore ${appWindowTitle(win)} window`} whileHover={magnify}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 20 }} className={styles.launcher}
            onFocus={event => revealDockControl(event.currentTarget)} onClick={() => { restoreWindow(win.id); focusPortfolioWindow(win.id); }}>
            <span aria-hidden="true" className="bg-[#1e1e1e]/90 backdrop-blur-md border border-white/20 rounded-lg flex flex-col overflow-hidden shadow-lg object-contain" style={iconStyle}>
              <span className="h-3 w-full bg-white/10 flex items-center px-1 gap-[2px]">
                <span className="w-1 h-1 rounded-full bg-[#ff5f56]" />
                <span className="w-1 h-1 rounded-full bg-[#ffbd2e]" />
                <span className="w-1 h-1 rounded-full bg-[#27c93f]" />
              </span>
              <span className="flex-1 w-full flex items-center justify-center p-1">
                <span className="text-[8px] md:text-[9px] text-white/80 font-medium truncate w-full text-center">{appWindowTitle(win)}</span>
              </span>
            </span>
            <span aria-hidden="true" className={styles.launcherLabel}>Restore {appWindowTitle(win)}</span>
          </motion.button>
        ))}

        {minimizedWindows.length > 0 && <div aria-hidden="true" className="w-[1px] h-12 bg-white/30 mx-1 rounded-full"></div>}

        <motion.button type="button" aria-label="Open Bin" aria-current={windows[focusedWindowId ?? ""]?.kind === "bin" ? "true" : undefined}
          id="trash-bin"
          data-dock-app="bin"
          whileHover={magnify}
          animate={isTrashHover && !reduceMotion ? { scale: 1.4, translateY: -10 } : { scale: 1, translateY: 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 20 }}
          className={`${styles.launcher} ${isTrashHover ? "bg-white/20 ring-2 ring-red-400/70" : ""}`}
          onFocus={event => revealDockControl(event.currentTarget)}
          onClick={handleBinClick}
        >
            <Image src={getBinIcon()} alt="" aria-hidden="true" width={iconPx} height={iconPx} loading="eager" draggable={false} style={iconStyle} className="drop-shadow-md pointer-events-none select-none object-contain" />
          <span aria-hidden="true" className={styles.launcherLabel}>
            Bin
          </span>
        </motion.button>
        
      </div>
    </nav>
  );
}
