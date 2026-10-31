"use client";

import { useMemo, type ComponentType } from "react";
import { AnimatePresence } from "framer-motion";
import { useWindowStore, type WindowState } from "./useWindowStore";
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
import { ProjectDetailView } from "@/components/desktop/ProjectDetailView";

export interface WindowContext {
  onActivateGameMenu: () => void;
}

interface WindowContentProps {
  context: WindowContext;
  window: WindowState;
}

const WINDOW_CONTENT: Record<string, ComponentType<WindowContentProps>> = {
  "about-me": AboutMeWindow,
  "about-app": AboutAppWindow,
  "bin": BinWindow,
  "secret-note": SecretNoteWindow,
  "finder": Finder, 
  "file-viewer": ProjectDetailView,
  "terminal": TerminalApp,
  "safari": SafariApp,
  "notes": NotesApp,
  "mail": MailApp,
  "music": MusicApp,
  "settings": SettingsApp,
  "facetime": FaceTimeApp,
  "neural-block": ProjectDetailView,
};

interface WindowManagerProps {
  dragConstraintsRef: React.RefObject<HTMLDivElement>;
  onActivateGameMenu: () => void;
}

export function WindowManager({ dragConstraintsRef, onActivateGameMenu }: WindowManagerProps) {
  const windows = useWindowStore(state => state.windows);
  const context = useMemo(() => ({ onActivateGameMenu }), [onActivateGameMenu]);


  return (
    <AnimatePresence>
      {Object.values(windows).map(window => {
        const Content = WINDOW_CONTENT[window.kind];
        return Content ? <WindowFrame key={window.id} window={window} dragConstraintsRef={dragConstraintsRef}>
          <Content context={context} window={window} />
        </WindowFrame> : null;
      })}
    </AnimatePresence>
  );
}
