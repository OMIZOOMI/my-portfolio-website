"use client";

import React from "react";
import { motion } from "framer-motion";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useSystemStore } from "../window-manager/useSystemStore";

import FinderIcon from "../../assets/3d-mac-os-finder.png";
import TerminalIcon from "../../assets/Terminal.png";
import NotesIcon from "../../assets/Notes.png";
import MailIcon from "../../assets/Mail.png";
import SafariIcon from "../../assets/safari.png";
import MusicIcon from "../../assets/Music.png";
import FaceTimeIcon from "../../assets/facetime.png";
import SettingsIcon from "../../assets/System-Settings.png";

import BinFullDark from "../../assets/Bin_Full_yrypldfXBR_icns-3aa31b35a7.png";
import BinEmptyDark from "../../assets/Empty_Bin_lVRgezRq9O_icns-9852c609a9.png";
import BinFullLight from "../../assets/Bin_Full_KtswXfzQ5b_icns-84dec9d369.png";
import BinEmptyLight from "../../assets/Bin_Empty_FL3A3BWzVE_icns-7500fa1e26.png";

export default function Dock() {
  const { theme, trashItems } = useSystemStore();
  const isDarkMode = theme === "dark";
  const isBinFull = trashItems.length > 0;
  // Lit while a pointer drag hovers the bin (computed by coordinate hit-test
  // in Finder/DragOverlay — no native dragover involved).
  const isTrashHover = useSystemStore((s) => s.isOverTrash);

  const windows = useWindowStore((s) => s.windows);
  const toggleMinimize = useWindowStore((s) => s.toggleMinimize);
  const minimizedWindows = Object.values(windows).filter((w) => w.minimized);

  const dockApps = [
    { id: "finder", name: "Finder", icon: FinderIcon.src },
    { id: "terminal", name: "Terminal", icon: TerminalIcon.src },
    { id: "notes", name: "Notes", icon: NotesIcon.src },
    { id: "mail", name: "Mail", icon: MailIcon.src },
    { id: "safari", name: "Safari", icon: SafariIcon.src },
    { id: "music", name: "Apple Music", icon: MusicIcon.src },
    { id: "facetime", name: "FaceTime", icon: FaceTimeIcon.src },
    { id: "settings", name: "Settings", icon: SettingsIcon.src },
  ];

  const getBinIcon = () => {
    if (isDarkMode && isBinFull) return BinFullDark.src;
    if (isDarkMode && !isBinFull) return BinEmptyDark.src;
    if (!isDarkMode && isBinFull) return BinFullLight.src;
    return BinEmptyLight.src;
  };

  const handleAppClick = (appId: string) => {
    if (appId === "finder") {
      useWindowStore.getState().openWindow({ id: "finder-desktop", kind: "finder", title: "Desktop" });
    } else {
      const appData = dockApps.find(a => a.id === appId);
      useWindowStore.getState().openWindow({ id: `app-${appId}`, kind: appId, title: appData?.name || "Application" });
    }
  };

  // Open the Bin window instead of auto-emptying
  const handleBinClick = () => {
    useWindowStore.getState().openWindow({
      id: "bin-window",
      kind: "bin",
      title: "Bin"
    });
  };

  return (
    <div data-dock="true" className="absolute bottom-4 w-full flex justify-center z-[9990]">
      <div className="flex items-end gap-2 px-3 pb-2 pt-2 bg-white/10 dark:bg-black/20 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-2xl shadow-2xl">
        
        {dockApps.map((app) => (
          <motion.div key={app.id} data-dock-app={app.id} whileHover={{ scale: 1.4, translateY: -10 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className="relative group cursor-pointer flex items-center justify-center" onClick={() => handleAppClick(app.id)}>
            <img src={app.icon} alt={app.name} draggable={false} className="w-12 h-12 md:w-14 md:h-14 drop-shadow-md pointer-events-none select-none object-contain" />
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 bg-gray-900/80 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              {app.name}
            </span>
          </motion.div>
        ))}

        <div className="w-[1px] h-12 bg-white/30 mx-1 rounded-full"></div>

        {minimizedWindows.map((win) => (
          <motion.div key={win.id} whileHover={{ scale: 1.4, translateY: -10 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className="relative group cursor-pointer flex items-center justify-center" onClick={() => toggleMinimize(win.id)}>
            <div className="w-12 h-12 md:w-14 md:h-14 bg-[#1e1e1e]/90 backdrop-blur-md border border-white/20 rounded-lg flex flex-col overflow-hidden shadow-lg object-contain">
              <div className="h-3 w-full bg-white/10 flex items-center px-1 gap-[2px]">
                <div className="w-1 h-1 rounded-full bg-[#ff5f56]" />
                <div className="w-1 h-1 rounded-full bg-[#ffbd2e]" />
                <div className="w-1 h-1 rounded-full bg-[#27c93f]" />
              </div>
              <div className="flex-1 w-full flex items-center justify-center p-1">
                <span className="text-[8px] md:text-[9px] text-white/80 font-medium truncate w-full text-center">{win.title}</span>
              </div>
            </div>
          </motion.div>
        ))}

        {minimizedWindows.length > 0 && <div className="w-[1px] h-12 bg-white/30 mx-1 rounded-full"></div>}

        <motion.div
          id="trash-bin"
          data-dock-app="bin"
          whileHover={{ scale: 1.4, translateY: -10 }}
          animate={isTrashHover ? { scale: 1.4, translateY: -10 } : { scale: 1, translateY: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className={`relative group cursor-pointer rounded-xl ${isTrashHover ? "bg-white/20 ring-2 ring-red-400/70" : ""}`}
          onClick={handleBinClick}
        >
          <img src={getBinIcon()} alt="Bin" draggable={false} className="w-12 h-12 md:w-14 md:h-14 drop-shadow-md pointer-events-none select-none object-contain" />
          <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 bg-gray-900/80 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
            Bin
          </span>
        </motion.div>
        
      </div>
    </div>
  );
}