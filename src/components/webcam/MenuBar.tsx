"use client";

import { useEffect, useState } from "react";
import { BatteryFull, BatteryLow, BatteryMedium, Wifi } from "lucide-react";
import { useMailStore } from "../window-manager/useMailStore";
import { useNotesStore } from "../desktop/NotesApp";
import { useMusicStore } from "../desktop/useMusicStore";
import { useSafariStore } from "../desktop/useSafariStore";
import { useSystemStore } from "../window-manager/useSystemStore";
import { useWindowStore } from "../window-manager/useWindowStore";

interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

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

function folderIdFromTitle(title: string | undefined): string {
  return title?.trim().toLowerCase().replace(/\s+/g, "-") || "desktop";
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

function openSettings() {
  useWindowStore.getState().openWindow({ id: "app-settings", kind: "settings", title: "Settings" });
}

function openFinder(title: string) {
  useWindowStore.getState().openWindow({
    id: generateWindowId("finder"),
    kind: "finder",
    title,
  });
}

function openExternal(url: string) {
  globalThis.open(url, "_blank", "noopener,noreferrer");
}

export function MenuBar() {
  const time = useAccurateClock();
  const batteryLevel = useBattery();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const activeWindow = useWindowStore((state) => {
    const focusedId = state.focusedWindowId;
    return focusedId ? state.windows[focusedId] ?? null : null;
  });
  const activeAppKind = activeWindow?.kind ?? "finder";
  const activeAppName = APP_NAMES[activeAppKind] ?? "Finder";
  const canUndo = useSystemStore((state) => state.past.length > 0);
  const canRedo = useSystemStore((state) => state.future.length > 0);
  const finderSidebarVisible = useSystemStore((state) => state.finderSidebarVisible);
  const finderPathBarVisible = useSystemStore((state) => state.finderPathBarVisible);
  const finderStatusBarVisible = useSystemStore((state) => state.finderStatusBarVisible);
  const bookmarksBarVisible = useSafariStore((state) => state.bookmarksBarVisible);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      event.preventDefault();
      if (event.shiftKey) useSystemStore.getState().redo();
      else useSystemStore.getState().undo();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const closeActiveWindow = () => {
    const { focusedWindowId, closeWindow } = useWindowStore.getState();
    if (focusedWindowId) closeWindow(focusedWindowId);
  };

  const activeFinderParent = folderIdFromTitle(activeWindow?.title);
  const toggleFinderSidebar = useSystemStore((state) => state.toggleFinderSidebar);
  const toggleFinderPathBar = useSystemStore((state) => state.toggleFinderPathBar);
  const toggleFinderStatusBar = useSystemStore((state) => state.toggleFinderStatusBar);
  const createFolder = useSystemStore((state) => state.createFolder);

  const menuItems: Record<string, MenuItem[]> = {
    "": [
      { label: "About This Mac", onSelect: () => { openSettings(); } },
      { label: "System Settings…", onSelect: openSettings },
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
      { label: `About ${activeAppName}`, onSelect: () => useWindowStore.getState().openWindow({ id: `about-${activeAppKind}`, kind: "about-app", title: `About ${activeAppName}`, size: { width: 320, height: 340 } }) },
      { label: "Preferences…", onSelect: openSettings },
      ...(activeAppKind === "finder" || activeAppKind === "bin"
        ? [{ label: "Empty Bin", onSelect: () => useSystemStore.getState().emptyTrash() }]
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
            { label: "Clear Note", onSelect: () => useNotesStore.getState().clearActiveNote() },
            { label: "Delete Note", onSelect: () => useNotesStore.getState().deleteActiveNote() },
          ]
        : []),
      ...(activeAppKind === "mail"
        ? [
            { label: "New Message", onSelect: () => useMailStore.getState().openComposer() },
            { label: "Clear Draft", onSelect: () => useMailStore.getState().clearDraft() },
            {
              label: "Send",
              onSelect: () => {
                const state = useMailStore.getState();
                if (!state.draftSubject || !state.draftBody) return;
                globalThis.open(`mailto:sawkare.om@gmail.com?subject=${encodeURIComponent(state.draftSubject)}&body=${encodeURIComponent(state.draftBody)}`, "_self");
                state.sendEmail({ to: "Om Sawkare", subject: state.draftSubject, body: state.draftBody });
                state.clearDraft();
                state.closeComposer();
              },
            },
          ]
        : []),
    ],
    File:
      activeAppKind === "finder" || activeAppKind === "bin"
        ? [
            { label: "New Finder Window", onSelect: () => openFinder("Desktop") },
            { label: "New Folder", onSelect: () => { createFolder(activeFinderParent); } },
            { label: "Empty Bin", onSelect: () => useSystemStore.getState().emptyTrash() },
            { label: "Close Window", shortcut: "⌘W", onSelect: closeActiveWindow },
          ]
        : activeAppKind === "safari"
          ? [
              { label: "New Tab", shortcut: "⌘T", onSelect: () => useSafariStore.getState().newTab() },
              { label: "Close Tab", shortcut: "⌘W", onSelect: () => { const state = useSafariStore.getState(); const tab = state.tabs.find((item) => item.id === state.activeTabId); if (tab) state.closeTab(tab.id); } },
              { label: "Close Window", onSelect: closeActiveWindow },
            ]
          : activeAppKind === "notes"
            ? [
                { label: "New Note", onSelect: () => useNotesStore.getState().addNote() },
                { label: "Delete Note", onSelect: () => useNotesStore.getState().deleteActiveNote() },
                { label: "Close Window", onSelect: closeActiveWindow },
              ]
            : activeAppKind === "mail"
              ? [
                  { label: "New Message", onSelect: () => useMailStore.getState().openComposer() },
                  { label: "Close Window", onSelect: closeActiveWindow },
                ]
              : [{ label: "Close Window", onSelect: closeActiveWindow }],
    Edit: [
      { label: "Undo", shortcut: "⌘Z", disabled: !canUndo, onSelect: () => useSystemStore.getState().undo() },
      { label: "Redo", shortcut: "⇧⌘Z", disabled: !canRedo, onSelect: () => useSystemStore.getState().redo() },
      { label: "Cut", shortcut: "⌘X", onSelect: () => document.execCommand("cut") },
      { label: "Copy", shortcut: "⌘C", onSelect: () => document.execCommand("copy") },
      {
        label: "Paste",
        shortcut: "⌘V",
        onSelect: () => {
          void navigator.clipboard?.readText().then((text) => document.execCommand("insertText", false, text));
        },
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
          ? [{ label: bookmarksBarVisible ? "Hide Bookmarks Bar" : "Show Bookmarks Bar", onSelect: () => useSafariStore.getState().toggleBookmarksBar() }]
          : activeAppKind === "music"
            ? [{ label: "Toggle Sidebar", onSelect: () => useMusicStore.getState().toggleSidebar() }]
            : [{ label: "Refresh App", onSelect: () => useWindowStore.getState().focusWindow(activeWindow?.id ?? "") }],
    Go: [
      { label: "Desktop", onSelect: () => openFinder("Desktop") },
      { label: "Documents", onSelect: () => openFinder("Documents") },
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
      { label: "Minimize", onSelect: () => { const id = useWindowStore.getState().focusedWindowId; if (id) useWindowStore.getState().toggleMinimize(id); } },
      { label: "Zoom / Maximize", onSelect: () => { const id = useWindowStore.getState().focusedWindowId; if (id) useWindowStore.getState().toggleMaximize(id); } },
      { label: "Close Active Window", shortcut: "⌘W", onSelect: closeActiveWindow },
      { label: "Bring All to Front", onSelect: () => useWindowStore.getState().bringAllToFront() },
    ],
    Help: [
      { label: "About This Portfolio", onSelect: () => useWindowStore.getState().openWindow({ id: "about-portfolio", kind: "about-app", title: "About This Portfolio", size: { width: 400, height: 400 } }) },
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
      {activeMenu && <div onClick={() => setActiveMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />}
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
        <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
          {topLevelMenus.map((menu) => {
            const items = menuItems[menu] ?? [];
            return (
              <div
                key={menu}
                onClick={() => setActiveMenu(activeMenu === menu ? null : menu)}
                onMouseEnter={() => { if (activeMenu !== null) setActiveMenu(menu); }}
                style={{
                  position: "relative",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 10px",
                  cursor: "pointer",
                  background: activeMenu === menu ? "rgba(255, 255, 255, 0.2)" : "transparent",
                  borderRadius: "4px",
                  fontWeight: menu === activeAppName ? 700 : 500,
                  fontSize: menu === "" ? "15px" : "13px",
                }}
              >
                {menu}
                {activeMenu === menu && items.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "28px",
                      left: 0,
                      minWidth: "220px",
                      background: "rgba(40, 40, 45, 0.9)",
                      backdropFilter: "blur(25px)",
                      WebkitBackdropFilter: "blur(25px)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "6px",
                      padding: "4px",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {items.map((item) => (
                      <button
                        type="button"
                        key={item.label}
                        disabled={item.disabled}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (item.disabled) return;
                          setActiveMenu(null);
                          item.onSelect();
                        }}
                        style={{
                          padding: "5px 12px",
                          borderRadius: "4px",
                          border: 0,
                          color: "inherit",
                          background: "transparent",
                          cursor: item.disabled ? "default" : "pointer",
                          opacity: item.disabled ? 0.4 : 1,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "24px",
                          textAlign: "left",
                          font: "inherit",
                        }}
                        onMouseEnter={(event) => { if (!item.disabled) event.currentTarget.style.background = "#0A60FF"; }}
                        onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
                      >
                        <span>{item.label}</span>
                        {item.shortcut && <span style={{ opacity: 0.6, fontSize: "12px" }}>{item.shortcut}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

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
