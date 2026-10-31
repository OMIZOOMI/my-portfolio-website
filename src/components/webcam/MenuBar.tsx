"use client";

import { useEffect, useRef, useState } from "react";
import { BatteryFull, BatteryLow, BatteryMedium, Wifi } from "lucide-react";
import { useMailStore } from "../window-manager/useMailStore";
import { useNotesStore } from "../desktop/NotesApp";
import { useMusicStore } from "../desktop/useMusicStore";
import { selectSafariSession, useSafariStore } from "../desktop/useSafariStore";
import { useSystemStore } from "../window-manager/useSystemStore";
import { useWindowStore } from "../window-manager/useWindowStore";
import { createFolderAndRename, useFileInteractionStore } from "../desktop/useFileInteractionStore";
import { DesktopMenus, type DesktopMenuItem } from "./DesktopMenus";
import { captureEditorMenuTarget, restoreEditorMenuTarget, fileHistoryShortcut, type EditorMenuTarget } from "./editorMenuCommands";
import { openPortfolioAbout, openSettings } from "../desktop/visitorLaunchers";
import { isTextEditingTarget } from "../desktop/fileSurfaceEvents";

type MenuItem = DesktopMenuItem;

const APP_NAMES: Record<string, string> = {
  finder: "Finder",
  terminal: "Terminal",
  safari: "Safari",
  notes: "Notes",
  mail: "Mail",
  music: "Music",
  settings: "Settings",
  facetime: "FaceTime",
  "about-app": "Portfolio",
  "about-me": "About Me",
  "file-viewer": "Preview",
  "neural-block": "Neural Block",
  bin: "Finder",
};

let windowIdCounter = 0;

function generateWindowId(prefix: string): string {
  windowIdCounter += 1;
  return `${prefix}-${windowIdCounter}-${Date.now()}`;
}

function useAccurateClock() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    let intervalId: number | undefined;
    let timeoutId: number | undefined;
    const syncClock = () => {
      const now = new Date();
      setTime(now);
      const msUntilNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
      timeoutId = window.setTimeout(() => {
        setTime(new Date());
        intervalId = window.setInterval(() => setTime(new Date()), 60000);
      }, msUntilNextMinute);
    };

    syncClock();
    return () => {
      if (intervalId) window.clearInterval(intervalId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  return time;
}

interface BatteryLike extends EventTarget {
  level: number;
}

function useBattery() {
  const [level, setLevel] = useState(100);

  useEffect(() => {
    let mounted = true;
    let battery: BatteryLike | null = null;
    let updateLevel: (() => void) | null = null;
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (typeof nav.getBattery !== "function") return undefined;

    nav.getBattery()
      .then((nextBattery) => {
        if (!mounted) return;
        battery = nextBattery;
        const update = () => setLevel(Math.round(nextBattery.level * 100));
        updateLevel = update;
        update();
        nextBattery.addEventListener("levelchange", update);
      })
      .catch(() => {
        if (mounted) setLevel(100);
      });

    return () => {
      mounted = false;
      if (battery && updateLevel) battery.removeEventListener("levelchange", updateLevel);
    };
  }, []);

  return level;
}

function openFinder(folderId: string, title: string) {
  useWindowStore.getState().openWindow({
    id: generateWindowId("finder"),
    kind: "finder",
    title,
    folderId,
  });
}

function openExternal(url: string) {
  globalThis.open(url, "_blank", "noopener,noreferrer");
}

export function MenuBar() {
  const time = useAccurateClock();
  const batteryLevel = useBattery();
  const savedEditor = useRef<EditorMenuTarget | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditorMenuTarget | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const activeWindow = useWindowStore((state) => {
    const focusedId = state.focusedWindowId;
    return focusedId ? state.windows[focusedId] ?? null : null;
  });
  const activeAppKind = activeWindow?.kind ?? "finder";
  const activeAppName = APP_NAMES[activeAppKind] ?? "Finder";
  const canEmptyBin = useSystemStore((state) => state.trashItems.length > 0);
  const canDeleteNote = useNotesStore((state) => !!state.activeNoteId);
  const canClearNote = useNotesStore((state) => !!state.notes.find((note) => note.id === state.activeNoteId)?.contentHtml);
  const canUndo = useSystemStore((state) => state.past.length > 0);
  const canRedo = useSystemStore((state) => state.future.length > 0);
  const finderSidebarVisible = useSystemStore((state) => state.finderSidebarVisible);
  const finderPathBarVisible = useSystemStore((state) => state.finderPathBarVisible);
  const finderStatusBarVisible = useSystemStore((state) => state.finderStatusBarVisible);
  const mailCanHandoff = useMailStore((state) => state.composing && !!state.draftSubject.trim() && !!state.draftBody.trim());
  const bookmarksBarVisible = useSafariStore((state) => state.bookmarksBarVisible);

  useEffect(() => {
    const remember = (event: Event) => {
      const snapshot = captureEditorMenuTarget(event.target);
      if (snapshot) savedEditor.current = snapshot;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab" && isTextEditingTarget(event.target)) remember(event);
      const windows = useWindowStore.getState();
      const kind = windows.focusedWindowId ? windows.windows[windows.focusedWindowId]?.kind ?? "finder" : "finder";
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target?.closest('#desktop-root') || target.closest('[role="menubar"]')) return;
      const command = fileHistoryShortcut(event, isTextEditingTarget(event.target), kind);
      if (!command) return;
      const files = useSystemStore.getState();
      if (!(command === "undo" ? files.past.length : files.future.length)) return;
      event.preventDefault(); files[command]();
    };
    document.addEventListener("focusin", remember);
    document.addEventListener("input", remember);
    window.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("focusin", remember); document.removeEventListener("input", remember); window.removeEventListener("keydown", onKeyDown); };
  }, []);

  const prepareMenu = () => {
    const captured = captureEditorMenuTarget(document.activeElement);
    if (captured) savedEditor.current = captured;
    const candidate = captured ?? savedEditor.current;
    setEditorTarget(candidate?.element.isConnected && candidate.windowId === (activeWindow?.id ?? null) ? candidate : null);
    setActionFeedback(null);
  };
  const nativeEdit = (command: "undo" | "redo" | "cut" | "copy") => {
    if (!restoreEditorMenuTarget(editorTarget, useWindowStore.getState().focusedWindowId)) return;
    let receivedInput = false;
    const recordInput = () => { receivedInput = true; };
    editorTarget!.element.addEventListener("input", recordInput);
    try {
      const applied = document.execCommand(command);
      if (applied && !receivedInput && editorTarget!.element.isContentEditable) editorTarget!.element.dispatchEvent(new Event("input", { bubbles: true }));
      if (!applied) setActionFeedback(`Use your editor’s keyboard ${command} command; this browser did not allow the menu action.`);
    } catch { setActionFeedback(`Use your editor’s keyboard ${command} command; this browser did not allow the menu action.`); }
    finally { editorTarget!.element.removeEventListener("input", recordInput); }
  };
  const pasteIntoEditor = async () => {
    const target = editorTarget;
    if (!target) return;
    try {
      const text = await navigator.clipboard.readText();
      if (restoreEditorMenuTarget(target, useWindowStore.getState().focusedWindowId)) document.execCommand("insertText", false, text);
    } catch { setActionFeedback("Clipboard access was unavailable. Use Paste from your browser or keyboard in the editor."); }
  };
  const editorOwnsEdit = !!editorTarget && editorTarget.windowId === (activeWindow?.id ?? null) && editorTarget.element.isConnected;
  const filesOwnEdit = !editorOwnsEdit && (activeAppKind === "finder" || activeAppKind === "bin");

  const closeActiveWindow = () => {
    const { focusedWindowId, closeWindow } = useWindowStore.getState();
    if (focusedWindowId) closeWindow(focusedWindowId);
  };

  const activeFileWindow = activeWindow?.kind === "finder" || activeWindow?.kind === "bin" ? activeWindow : null;
  const activeFinderParent = activeFileWindow?.folderId ?? (activeFileWindow?.kind === "bin" ? "bin" : "desktop");
  const activeSurface = activeFileWindow?.id ?? "desktop";
  const selectedId = useFileInteractionStore((state) => state.selections[activeSurface] ?? null);
  const canCreateFolder = useSystemStore((state) => activeFinderParent !== "bin" && !!state.fileSystem[activeFinderParent] && !state.isHidden(activeFinderParent));
  const canRenameFolder = useSystemStore((state) => {
    if (!selectedId || activeFinderParent === "bin" || state.isHidden(selectedId)) return false;
    const children = activeFinderParent === "desktop" ? state.desktopIds : (state.fileSystem[activeFinderParent] ?? []).map((item) => item.id);
    return children.includes(selectedId) && state.getFileItem(selectedId)?.type === "folder";
  });
  const toggleFinderSidebar = useSystemStore((state) => state.toggleFinderSidebar);
  const toggleFinderPathBar = useSystemStore((state) => state.toggleFinderPathBar);
  const toggleFinderStatusBar = useSystemStore((state) => state.toggleFinderStatusBar);

  const menuItems: Record<string, MenuItem[]> = {
    "": [
      { label: "About This Mac", onSelect: () => openSettings("about") },
      { label: "System Settings…", onSelect: () => openSettings() },
      { label: "Restart Portfolio", onSelect: () => globalThis.location.reload() },
      {
        label: "Close All Windows",
        onSelect: () => {
          const { windows, closeWindow } = useWindowStore.getState();
          Object.keys(windows).forEach(closeWindow);
        },
      },
    ],
    [activeAppName]: [
      activeAppKind === "about-app" || activeAppKind === "about-me"
        ? { label: "About This Portfolio", onSelect: openPortfolioAbout }
        : { label: `About ${activeAppName}`, onSelect: () => useWindowStore.getState().openWindow({ id: `about-${activeAppKind}`, kind: "about-app", title: `About ${activeAppName}`, size: { width: 320, height: 340 } }) },
      { label: "Preferences…", onSelect: () => openSettings() },
      ...(activeAppKind === "finder" || activeAppKind === "bin"
        ? [{ label: "Empty Bin", disabled: !canEmptyBin, onSelect: () => useSystemStore.getState().emptyTrash() }]
        : []),
      ...(activeAppKind === "safari"
        ? [
            { label: "New Tab", onSelect: () => useSafariStore.getState().newTab() },
            { label: "Reload Page", onSelect: () => useSafariStore.getState().reload() },
            { label: "Bookmarks", onSelect: () => useSafariStore.getState().navigate("portfolio://start", "Start Page") },
            { label: "Open External GitHub", onSelect: () => openExternal("https://github.com/OMIZOOMI") },
          ]
        : []),
      ...(activeAppKind === "music"
        ? [
            { label: "Play / Pause", onSelect: () => useMusicStore.getState().togglePlay() },
            { label: "Previous Track", onSelect: () => useMusicStore.getState().previousTrack() },
            { label: "Next Track", onSelect: () => useMusicStore.getState().nextTrack() },
            { label: "Toggle Shuffle", onSelect: () => useMusicStore.getState().toggleShuffle() },
            { label: "Toggle Repeat", onSelect: () => useMusicStore.getState().toggleRepeat() },
          ]
        : []),
      ...(activeAppKind === "notes"
        ? [
            { label: "New Note", onSelect: () => useNotesStore.getState().addNote() },
            { label: "Clear Note", disabled: !canClearNote, onSelect: () => useNotesStore.getState().clearActiveNote() },
            { label: "Delete Note", disabled: !canDeleteNote, onSelect: () => useNotesStore.getState().deleteActiveNote() },
          ]
        : []),
      ...(activeAppKind === "mail"
        ? [
            { label: "New Message", onSelect: () => useMailStore.getState().openComposer() },
            { label: "Clear Draft", onSelect: () => useMailStore.getState().clearDraft() },
            {
              label: "Open in your email app",
              disabled: !mailCanHandoff,
              onSelect: () => { useMailStore.getState().openDraftInEmailApp(); },
            },
          ]
        : []),
    ],
    File:
      activeAppKind === "finder" || activeAppKind === "bin"
        ? [
            { label: "New Finder Window", onSelect: () => openFinder("desktop", "Desktop") },
            { label: "New Folder", disabled: !canCreateFolder, onSelect: () => { createFolderAndRename(activeSurface, activeFinderParent); } },
            { label: "Rename Selected Folder", shortcut: "F2", disabled: !canRenameFolder, onSelect: () => { if (selectedId) useFileInteractionStore.getState().beginRename(activeSurface, selectedId); } },
            { label: "Empty Bin", disabled: !canEmptyBin, onSelect: () => useSystemStore.getState().emptyTrash() },
            { label: "Close Window", disabled: !activeWindow, shortcut: "⌘W", onSelect: closeActiveWindow },
          ]
        : activeAppKind === "safari"
          ? [
              { label: "New Tab", shortcut: "⌘T", onSelect: () => useSafariStore.getState().newTab() },
              { label: "Close Tab", shortcut: "⌘W", onSelect: () => { const state = useSafariStore.getState(); state.closeTab(selectSafariSession(state).activeTabId); } },
              { label: "Close Window", disabled: !activeWindow, onSelect: closeActiveWindow },
            ]
          : activeAppKind === "notes"
            ? [
                { label: "New Note", onSelect: () => useNotesStore.getState().addNote() },
                { label: "Delete Note", disabled: !canDeleteNote, onSelect: () => useNotesStore.getState().deleteActiveNote() },
                { label: "Close Window", disabled: !activeWindow, onSelect: closeActiveWindow },
              ]
            : activeAppKind === "mail"
              ? [
                  { label: "New Message", onSelect: () => useMailStore.getState().openComposer() },
                  { label: "Close Window", disabled: !activeWindow, onSelect: closeActiveWindow },
                ]
              : [{ label: "Close Window", disabled: !activeWindow, onSelect: closeActiveWindow }],
    Edit: [
      { label: "Undo", shortcut: "⌘Z", disabled: editorOwnsEdit ? !editorTarget.canUndo : !filesOwnEdit || !canUndo, onSelect: () => { if (editorOwnsEdit) nativeEdit("undo"); else if (filesOwnEdit) useSystemStore.getState().undo(); } },
      { label: "Redo", shortcut: "⇧⌘Z", disabled: editorOwnsEdit ? !editorTarget.canRedo : !filesOwnEdit || !canRedo, onSelect: () => { if (editorOwnsEdit) nativeEdit("redo"); else if (filesOwnEdit) useSystemStore.getState().redo(); } },
      { label: "Cut", shortcut: "⌘X", disabled: !editorOwnsEdit || !editorTarget.hasSelection, onSelect: () => nativeEdit("cut") },
      { label: "Copy", shortcut: "⌘C", disabled: !editorOwnsEdit || !editorTarget.hasSelection, onSelect: () => nativeEdit("copy") },
      {
        label: "Paste", shortcut: "⌘V",
        disabled: !editorOwnsEdit || typeof navigator === "undefined" || !navigator.clipboard?.readText,
        onSelect: () => { void pasteIntoEditor(); },
      },
    ],
    View:
      activeAppKind === "finder" || activeAppKind === "bin"
        ? [
            { label: finderSidebarVisible ? "Hide Sidebar" : "Show Sidebar", onSelect: toggleFinderSidebar },
            { label: finderPathBarVisible ? "Hide Path Bar" : "Show Path Bar", onSelect: toggleFinderPathBar },
            { label: finderStatusBarVisible ? "Hide Status Bar" : "Show Status Bar", onSelect: toggleFinderStatusBar },
          ]
        : activeAppKind === "safari"
          ? [{ label: "Reload Page", onSelect: () => useSafariStore.getState().reload() }, { label: bookmarksBarVisible ? "Hide Bookmarks Bar" : "Show Bookmarks Bar", onSelect: () => useSafariStore.getState().toggleBookmarksBar() }]
          : activeAppKind === "music"
            ? [{ label: "Toggle Sidebar", onSelect: () => useMusicStore.getState().toggleSidebar() }]
            : [{ label: "Refresh App", disabled: true, onSelect: () => {} }],
    Go: [
      { label: "Desktop", onSelect: () => openFinder("desktop", "Desktop") },
      { label: "Documents", onSelect: () => openFinder("documents", "Documents") },
      { label: "Bin", onSelect: () => useWindowStore.getState().openWindow({ id: "bin-window", kind: "bin", title: "Bin" }) },
      ...(activeAppKind === "safari"
        ? [
            { label: "Start Page", onSelect: () => useSafariStore.getState().navigate("portfolio://start", "Start Page") },
            { label: "GitHub", onSelect: () => openExternal("https://github.com/OMIZOOMI") },
            { label: "LinkedIn", onSelect: () => openExternal("https://www.linkedin.com/in/om-sawkare") },
          ]
        : []),
    ],
    Window: [
      { label: "Minimize", disabled: !activeWindow, onSelect: () => { const id = useWindowStore.getState().focusedWindowId; if (id) useWindowStore.getState().toggleMinimize(id); } },
      { label: "Zoom / Maximize", disabled: !activeWindow, onSelect: () => { const id = useWindowStore.getState().focusedWindowId; if (id) useWindowStore.getState().toggleMaximize(id); } },
      { label: "Close Active Window", disabled: !activeWindow, shortcut: "⌘W", onSelect: closeActiveWindow },
      { label: "Bring All to Front", onSelect: () => useWindowStore.getState().bringAllToFront() },
    ],
    Help: [
      { label: "About This Portfolio", onSelect: openPortfolioAbout },
      { label: "GitHub Repository", onSelect: () => openExternal("https://github.com/OMIZOOMI/my-portfolio-website") },
      { label: "LinkedIn", onSelect: () => openExternal("https://www.linkedin.com/in/om-sawkare") },
    ],
  };

  const topLevelMenus = ["", activeAppName, "File", "Edit", "View", "Go", "Window", "Help"];
  const timeString = time ? time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const dateString = time ? time.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "";
  const BatteryIcon = batteryLevel > 70 ? BatteryFull : batteryLevel > 30 ? BatteryMedium : BatteryLow;

  return (
    <>
      <nav
        aria-label="macOS Menu Bar"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "28px",
          background: "rgba(0, 0, 0, 0.25)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 16px",
          color: "rgba(255, 255, 255, 0.95)",
          fontSize: "13px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontWeight: 500,
          letterSpacing: "0.3px",
          zIndex: 9999,
          userSelect: "none",
        }}
      >
        <DesktopMenus key={`${activeWindow?.id ?? "desktop"}-${activeAppKind}`} menus={topLevelMenus.map((label) => ({ label, items: menuItems[label] ?? [] }))} appName={activeAppName} onPrepare={prepareMenu} />
        {actionFeedback && <p role="status" style={{ position: "absolute", top: 32, right: 16, maxWidth: 360, padding: 10, borderRadius: 6, background: "#28282d", fontSize: 12 }}>{actionFeedback}</p>}

        <div aria-hidden="true" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 0, width: "160px", height: "28px", background: "#000", borderBottomLeftRadius: "12px", borderBottomRightRadius: "12px", boxShadow: "inset 0 -1px 1px rgba(255,255,255,0.1)" }} />

        <div style={{ display: "flex", gap: "16px", alignItems: "center", height: "100%" }}>
          <div aria-label="Wi-Fi status" style={{ display: "flex", alignItems: "center", padding: "0 6px", borderRadius: "4px", height: "100%" }}>
            <Wifi size={15} strokeWidth={2.5} />
          </div>
          <div aria-label={`Battery ${batteryLevel}%`} style={{ display: "flex", gap: "6px", alignItems: "center", padding: "0 6px", borderRadius: "4px", height: "100%" }}>
            <span style={{ fontSize: "12px", opacity: 0.9 }}>{batteryLevel}%</span>
            <BatteryIcon size={16} strokeWidth={2} />
          </div>
          <span style={{ display: "flex", alignItems: "center", padding: "0 8px", borderRadius: "4px", height: "100%" }}>
            {dateString} {timeString}
          </span>
        </div>
      </nav>
    </>
  );
}
