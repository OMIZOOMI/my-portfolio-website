"use client";

import type { ComponentType } from "react";
import { AnimatePresence } from "framer-motion";
import { useWindowStore } from "./useWindowStore";
import { WindowFrame } from "@/components/window-manager/WindowFrame";
import { AboutAppWindow } from "@/components/desktop/AboutAppWindow";
import { BinWindow } from "@/components/desktop/BinWindow";
import { AboutMeWindow } from "@/components/desktop/AboutMeWindow";
import { SecretNoteWindow } from "@/components/easter-egg/SecretNoteWindow";
import { Finder } from "@/components/desktop/Finder";
import { TerminalApp } from "@/components/desktop/TerminalApp";
import { NotesApp } from "@/components/desktop/NotesApp";
import { MailApp } from "@/components/desktop/MailApp";
import { SafariApp } from "@/components/desktop/SafariApp";
import { MusicApp } from "@/components/desktop/MusicApp";
import { SettingsApp } from "@/components/desktop/SettingsApp";
import { FaceTimeApp } from "@/components/desktop/FaceTimeApp";

// 1. Added Finder icon import for the modal
import FinderIcon from "../../assets/3d-mac-os-finder.png";

export interface WindowContext {
  onActivateGameMenu: () => void;
}

interface WindowContentProps {
  context: WindowContext;
  window: any; 
}

// A generic placeholder component for apps/files we haven't built out yet!
const GenericAppWindow = ({ window }: WindowContentProps) => (
  <div className="w-full h-full flex flex-col items-center justify-center bg-[#1e1e1e] text-white/50 p-8 text-center">
    <div className="text-4xl mb-4">🚧</div>
    <h2 className="text-xl font-semibold text-white/80 mb-2">{window.title}</h2>
    <p className="text-sm">This application or file is currently under development.</p>
  </div>
);

// 2. Added the inlined About Finder dialog component
const AboutFinderApp = () => (
  <div className="w-full h-full flex flex-col items-center bg-[#282828] text-gray-200 font-sans p-6 pt-10 text-center select-none">
    <img 
      src={FinderIcon.src || FinderIcon as any} 
      alt="Finder" 
      draggable={false}
      className="w-24 h-24 drop-shadow-2xl mb-4 pointer-events-none"
    />
    <h1 className="text-xl font-bold text-white mb-2 tracking-wide">Finder</h1>
    <p className="text-[13px] font-medium text-gray-300 mb-4">The Portfolio Desktop Experience</p>
    <p className="text-[11px] text-gray-400 mb-8">Finder version 26.4</p>
    
    <div className="mt-auto text-[12px] text-gray-500 leading-relaxed font-medium">
      <p>™ by omisan & © 2026 Om Sawkare.</p>
      <p>All Rights Reserved.</p>
    </div>
  </div>
);

// 3. Updated the registry with About Finder and Neural Block
const WINDOW_CONTENT: Record<string, ComponentType<WindowContentProps>> = {
  "about-me": AboutMeWindow,
  "about-app": AboutAppWindow,
  "bin": BinWindow,
  "secret-note": SecretNoteWindow,
  "finder": Finder, 
  "file-viewer": GenericAppWindow, 
  "terminal": TerminalApp,
  "safari": SafariApp,
  "notes": NotesApp,
  "mail": MailApp,
  "music": MusicApp,
  "settings": SettingsApp,
  "facetime": FaceTimeApp,
  "neural-block": GenericAppWindow, // Updated from kingshot to neural-block
};

interface WindowManagerProps {
  dragConstraintsRef: React.RefObject<HTMLDivElement>;
  onActivateGameMenu: () => void;
}

export function WindowManager({ dragConstraintsRef, onActivateGameMenu }: WindowManagerProps) {
  const windows = useWindowStore((s) => s.windows);
  const context: WindowContext = { onActivateGameMenu };

  return (
    <AnimatePresence>
      {Object.values(windows).map((win) => {
        const Content = WINDOW_CONTENT[win.kind];
        if (!Content) return null;

        return (
          <WindowFrame key={win.id} window={win} dragConstraintsRef={dragConstraintsRef}>
            <Content context={context} window={win} />
          </WindowFrame>
        );
      })}
    </AnimatePresence>
  );
}