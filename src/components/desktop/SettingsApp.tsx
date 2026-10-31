"use client";

import React from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Sun,
  Moon,
  Palette,
  Info,
  Accessibility,
  Dock as DockIcon,
  Database,
  Check,
  AlertTriangle,
} from "lucide-react";
import {
  useSystemStore,
  ACCENT_HEX,
  type AccentName,
  type WallpaperMode,
} from "../window-manager/useSystemStore";
import { useNotesStore } from "./NotesApp";
import { useMailStore } from "../window-manager/useMailStore";
import { useWindowStore, type WindowState } from "../window-manager/useWindowStore";
import { WallpaperPicker } from "./WallpaperPicker";
import styles from "./SettingsApp.module.css";

const ACCENTS: { name: AccentName; label: string }[] = [
  { name: "blue", label: "Blue" },
  { name: "purple", label: "Purple" },
  { name: "green", label: "Green" },
  { name: "orange", label: "Orange" },
  { name: "graphite", label: "Graphite" },
];

type TabId = "appearance" | "about" | "accessibility" | "dock" | "advanced";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette size={15} /> },
  { id: "about", label: "About", icon: <Info size={15} /> },
  { id: "accessibility", label: "Accessibility", icon: <Accessibility size={15} /> },
  { id: "dock", label: "Dock", icon: <DockIcon size={15} /> },
  { id: "advanced", label: "Advanced", icon: <Database size={15} /> },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">
      {children}
    </h3>
  );
}

function Toggle({
  on,
  onChange,
  accent,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  accent: string;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${on ? "" : "bg-gray-300 dark:bg-white/15"}`}
      style={on ? { backgroundColor: accent } : undefined}
    >
      <span
        className="block w-5 h-5 rounded-full bg-white shadow transition-transform"
        style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}

export function SettingsApp({ window }: { window: WindowState }) {
  const activeTab = window.settingsSection ?? "appearance";
  const setActiveTab = (section: TabId) => useWindowStore.getState().setSettingsSection(window.id, section);
  const {
    theme,
    setTheme,
    wallpaperMode,
    setWallpaperMode,
    accent,
    setAccent,
    reduceMotion,
    setReduceMotion,
    dockMagnification,
    setDockMagnification,
    dockSize,
    setDockSize,
    trashItems,
    desktopIds,
  } = useSystemStore(useShallow((s) => ({
    theme: s.theme, setTheme: s.setTheme,
    wallpaperMode: s.wallpaperMode, setWallpaperMode: s.setWallpaperMode,
    accent: s.accent, setAccent: s.setAccent,
    reduceMotion: s.reduceMotion, setReduceMotion: s.setReduceMotion,
    dockMagnification: s.dockMagnification, setDockMagnification: s.setDockMagnification,
    dockSize: s.dockSize, setDockSize: s.setDockSize,
    trashItems: s.trashItems, desktopIds: s.desktopIds,
  })));
  const noteCount = useNotesStore((s) => s.notes.length);
  const sentCount = useMailStore((s) => s.sent.length);
  const inboxCount = useMailStore((s) => s.inbox.length);

  const accentHex = ACCENT_HEX[accent];

  const handleFactoryReset = () => {
    const confirmed = globalThis.confirm(
      "Erase All Content and Settings?\n\nThis wipes every persisted state (notes, mail, Finder layout, trash) and reloads fresh. This cannot be undone."
    );
    if (!confirmed) return;
    localStorage.clear();
    globalThis.location.reload();
  };

  return (
    <div className={`${styles.app} w-full h-full bg-[#f4f4f4] text-gray-800 dark:bg-[#1e1e1e] dark:text-gray-200 font-sans flex overflow-hidden transition-colors duration-1000 ease-in-out`} data-settings-app data-reduced-motion={reduceMotion || undefined}>
      {/* Sidebar — glassmorphic nav */}
      <div
        className={`${styles.sidebar} w-48 shrink-0 h-full bg-[#ebebeb] dark:bg-black/30 backdrop-blur-xl border-r border-gray-300 dark:border-white/10 p-2 flex flex-col gap-1 overflow-y-auto transition-colors duration-1000 ease-in-out`}
        style={{ transform: "translateZ(0)" }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              data-settings-section={tab.id}
              aria-label={tab.label}
              title={tab.label}
              onClick={() => setActiveTab(tab.id)}
              aria-current={active ? "page" : undefined}
              className={`${styles.navigation} flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-left ${
                active ? "" : "text-gray-600 dark:text-[#d4d4d8] hover:bg-gray-300/60 dark:hover:bg-white/10"
              }`}
              style={
                active
                  ? { backgroundColor: `${accentHex}33`, color: accentHex }
                  : undefined
              }
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Scroll regions are shared with the projected desktop's wheel routing. */}
      <div
        className={`${styles.content} flex-1 p-8 overflow-y-auto min-w-0 min-h-0 transition-colors duration-1000 ease-in-out`}
        style={{ transform: "translateZ(0)" }}
      >
        {activeTab === "appearance" && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Appearance</h2>

            <div className="mb-8">
              <SectionTitle>Mode</SectionTitle>
              <div className="flex gap-4">
                <button
                  data-appearance-theme="light"
                  onClick={() => setTheme("light")}
                  className={`${styles.themeChoice} flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${theme === "light" ? "scale-105" : "border-gray-300 hover:border-gray-400 dark:border-white/10 dark:hover:border-white/30"}`}
                  style={theme === "light" ? { borderColor: accentHex, backgroundColor: `${accentHex}1a` } : undefined}
                >
                  <Sun size={24} style={theme === "light" ? { color: accentHex } : undefined} className={theme === "light" ? "" : "text-gray-400"} />
                  <span className="text-sm font-medium">Light</span>
                </button>
                <button
                  data-appearance-theme="dark"
                  onClick={() => setTheme("dark")}
                  className={`${styles.themeChoice} flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${theme === "dark" ? "scale-105" : "border-gray-300 hover:border-gray-400 dark:border-white/10 dark:hover:border-white/30"}`}
                  style={theme === "dark" ? { borderColor: accentHex, backgroundColor: `${accentHex}1a` } : undefined}
                >
                  <Moon size={24} style={theme === "dark" ? { color: accentHex } : undefined} className={theme === "dark" ? "" : "text-gray-400"} />
                  <span className="text-sm font-medium">Dark</span>
                </button>
              </div>
            </div>

            <div className="mb-8">
              <SectionTitle>Accent Color</SectionTitle>
              <div className="flex flex-wrap gap-3">
                {ACCENTS.map((a) => (
                  <button
                    key={a.name}
                    onClick={() => setAccent(a.name)}
                    title={a.label}
                    aria-label={`${a.label} accent`}
                    aria-pressed={accent === a.name}
                    className={`${styles.accentChoice} w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-transform hover:scale-110`}
                    style={{
                      backgroundColor: ACCENT_HEX[a.name],
                      boxShadow: accent === a.name ? `0 0 0 2px #1e1e1e, 0 0 0 4px ${ACCENT_HEX[a.name]}` : "none",
                    }}
                  >
                    {accent === a.name && <Check size={16} className="text-white" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <SectionTitle>Wallpaper Theme</SectionTitle>
              <WallpaperPicker accent={accentHex} />
            </div>

            <div>
              <SectionTitle>Wallpaper Mode</SectionTitle>
              <div className={`${styles.wallpaperModes} flex flex-wrap gap-3`}>
                {(["auto", "light", "dark"] as WallpaperMode[]).map((mode) => (
                  <button
                    key={mode}
                    data-wallpaper-mode={mode}
                    onClick={() => setWallpaperMode(mode)}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      wallpaperMode === mode
                        ? "bg-[var(--system-accent)] text-white"
                        : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                    aria-pressed={wallpaperMode === mode}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">Auto follows Appearance. Light and Dark keep their own lighting.</p>
            </div>
          </div>
        )}

        {activeTab === "about" && (
          <div className="max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">About This Mac</h2>
            <div className="rounded-2xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-6 flex flex-col items-center text-center transition-colors duration-1000 ease-in-out">
              <span className="text-5xl mb-3" aria-hidden="true">💻</span>
              <p className="text-lg font-bold text-gray-900 dark:text-white">Om Nilesh Sawkare</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Portfolio OS 26.4</p>
              <dl className="w-full text-left text-sm space-y-3">
                <div className="flex justify-between gap-4 border-b border-gray-200 dark:border-white/5 pb-2.5">
                  <dt className="text-gray-500 dark:text-gray-400">Processor</dt>
                  <dd className="font-medium text-right">Final-Year Computer Science Engineering</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-gray-200 dark:border-white/5 pb-2.5">
                  <dt className="text-gray-500 dark:text-gray-400">Memory</dt>
                  <dd className="font-medium text-right">C++, Python, Java, Next.js</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 dark:text-gray-400">Graphics</dt>
                  <dd className="font-medium text-right">Edge AI &amp; Cloud-Native Architectures</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {activeTab === "accessibility" && (
          <div className="max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Accessibility</h2>
            <div className="rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-4 transition-colors duration-1000 ease-in-out flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Reduce Motion</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  Disables celebratory animation loops (FaceTime confetti, floating likes)
                  and other heavy motion across the OS.
                </p>
              </div>
              <Toggle on={reduceMotion} onChange={setReduceMotion} accent={accentHex} label="Reduce motion" />
            </div>
          </div>
        )}

        {activeTab === "dock" && (
          <div className="max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Dock</h2>
            <div className="rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-4 transition-colors duration-1000 ease-in-out flex items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-sm font-semibold">Magnification</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Zoom icons on hover.
                </p>
              </div>
              <Toggle on={dockMagnification} onChange={setDockMagnification} accent={accentHex} label="Dock magnification" />
            </div>
            <div className="rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-4 transition-colors duration-1000 ease-in-out">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Size</p>
                <span className="text-xs text-gray-500 dark:text-gray-400">{Math.round(dockSize * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.75}
                max={1.5}
                step={0.05}
                value={dockSize}
                onChange={(e) => setDockSize(Number(e.target.value))}
                className="w-full"
                style={{ accentColor: accentHex }}
                aria-label="Dock size"
              />
              <div className="flex justify-between text-[11px] text-gray-500 mt-1">
                <span>Small</span>
                <span>Large</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "advanced" && (
          <div className="max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Advanced</h2>
            <div className="mb-6">
              <SectionTitle>Storage</SectionTitle>
              <div className="rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 divide-y divide-gray-200 dark:divide-white/5 text-sm transition-colors duration-1000 ease-in-out">
                {[
                  ["Desktop items", desktopIds.length],
                  ["Items in Bin", trashItems.length],
                  ["Notes", noteCount],
                  ["Mail messages", inboxCount + sentCount],
                ].map(([label, count]) => (
                  <div key={label as string} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-gray-600 dark:text-gray-300">{label}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <SectionTitle>Reset</SectionTitle>
              <button
                onClick={handleFactoryReset}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-sm font-semibold rounded-xl px-4 py-3 transition-colors"
              >
                <AlertTriangle size={16} />
                Erase All Content and Settings
              </button>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                Wipes notes, mail, Finder layout, trash, and all persisted states, then reloads fresh.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
