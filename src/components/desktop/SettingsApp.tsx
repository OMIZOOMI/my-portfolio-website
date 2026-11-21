"use client";

import React from "react";
import { GlassButton, GlassSwitch } from "../ui/PortfolioGlass";
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
  Volume2,
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
import { DISPLAY_SIZES, ICON_SIZES, useDisplayStore } from "../window-manager/useDisplayStore";
import { useWorkspaceStore } from "../workspace/useWorkspaceStore";
import { PortfolioIdentity } from "../portfolio/PortfolioIdentity";
import { PortfolioResetDialog } from "./PortfolioResetDialog";
import { resetPortfolioSettings } from "./resetPortfolioSettings";
import { useIntroductionStore } from "../portfolio/useIntroductionStore";

const ACCENTS: { name: AccentName; label: string }[] = [
  { name: "blue", label: "Blue" },
  { name: "purple", label: "Purple" },
  { name: "green", label: "Green" },
  { name: "orange", label: "Orange" },
  { name: "graphite", label: "Graphite" },
];

type TabId = "appearance" | "about" | "accessibility" | "sound" | "dock" | "advanced";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette size={15} /> },
  { id: "about", label: "About", icon: <Info size={15} /> },
  { id: "accessibility", label: "Accessibility", icon: <Accessibility size={15} /> },
  { id: "sound", label: "Sound", icon: <Volume2 size={15} /> },
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
  return <GlassSwitch aria-label={label} checked={on} onCheckedChange={onChange}
    className={styles.glassToggle} style={{ "--lg-on": accent } as React.CSSProperties} />;
}

export function SettingsApp({ window }: { window: WindowState }) {
  const [resetOpen, setResetOpen] = React.useState(false);
  const [resetStatus, setResetStatus] = React.useState("");
  const resetButton = React.useRef<HTMLButtonElement>(null);
  const interfaceScale = useDisplayStore(s => s.interfaceScale);
  const iconScale = useDisplayStore(s => s.iconScale);
  const screenView = useDisplayStore(s => s.screenView);
  const defaultView = useDisplayStore(s => s.defaultView);
  const keyboardSounds = useWorkspaceStore(s => s.keyboardSounds);
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

  const handlePreferenceReset = () => {
    const result = resetPortfolioSettings();
    setResetOpen(false);
    setResetStatus(result.failedKeys.length
      ? "Defaults applied for this visit. This browser could not update saved preferences. Your open work was kept."
      : "Portfolio settings reset. Your current view and open work were kept.");
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
            <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">About This Portfolio</h2>
            <div className="rounded-2xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-6 flex flex-col items-center text-center transition-colors duration-1000 ease-in-out">
              <PortfolioIdentity />
            </div>
          </div>
        )}

        {activeTab === "accessibility" && (
          <div className="max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Accessibility</h2>
            <div className={styles.readabilityCard} data-laptop-setting>
              <h3>A quick introduction</h3><p>Explore the portfolio at your own pace. Replaying keeps your open work.</p>
              <GlassButton type="button" className={styles.actionButton} onClick={() => useIntroductionStore.getState().replay()}>Replay introduction</GlassButton>
            </div>
            <div className={styles.readabilityCard} data-laptop-setting>
              <h3>Make room to read</h3>
              <p>Screen view fills the page with your desktop. Your open apps and work stay with you.</p>
              <GlassButton type="button" className={styles.actionButton} aria-pressed={screenView} onClick={() => useDisplayStore.getState().setScreenView(!screenView)}>{screenView ? "Back to laptop" : "Enter Screen view"}</GlassButton>
              <p>Switching views keeps your apps open. Choose a default below to remember how your next visit starts.</p>
              <div className={styles.sizeOptions} role="group" aria-label="Default portfolio view">
                <GlassButton type="button" data-default-view="laptop" aria-pressed={defaultView === "laptop"} onClick={() => useDisplayStore.getState().setDefaultView("laptop")}>Start in laptop view</GlassButton>
                <GlassButton type="button" data-default-view="screen" aria-pressed={defaultView === "screen"} onClick={() => useDisplayStore.getState().setDefaultView("screen")}>Start in Screen view</GlassButton>
              </div>
            </div>
            <div className={styles.readabilityCard}>
              <h3>Text & interface size</h3>
              <p>Enlarge text, controls, and the Dock together.</p>
              <div className={styles.sizeOptions} role="group" aria-label="Text and interface size">
                {DISPLAY_SIZES.map((size, index) => <GlassButton key={size} type="button" data-interface-size={size} aria-pressed={interfaceScale === size} onClick={() => useDisplayStore.getState().setInterfaceScale(size)}>{["Default", "Larger", "Large", "Largest"][index]}<small>{Math.round(size * 100)}%</small></GlassButton>)}
              </div>
            </div>
            <div className={styles.readabilityCard}>
              <h3>Folder & file icons</h3><p>A little extra room for desktop and Files icons.</p>
              <div className={styles.sizeOptions} role="group" aria-label="Folder and file icon size">
                {ICON_SIZES.map((size, index) => <GlassButton key={size} type="button" data-icon-size={size} aria-pressed={iconScale === size} onClick={() => useDisplayStore.getState().setIconScale(size)}>{["Default", "Larger", "Largest"][index]}</GlassButton>)}
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-4 transition-colors duration-1000 ease-in-out flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Reduce Motion</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  Reduces camera effects and other motion across the portfolio.
                </p>
              </div>
              <Toggle on={reduceMotion} onChange={setReduceMotion} accent={accentHex} label="Reduce motion" />
            </div>
          </div>
        )}

        {activeTab === "sound" && <div className="max-w-md">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Sound</h2>
          <div className={styles.readabilityCard}>
            <div className={styles.toggleRow}><div><h3>Keyboard clicks</h3><p>Soft, creamy mechanical clicks with each keypress. Sound begins when you type.</p></div>
              <Toggle on={keyboardSounds} onChange={(enabled) => useWorkspaceStore.getState().setKeyboardSounds(enabled)} accent={accentHex} label="Keyboard click sounds" />
            </div>
          </div>
          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">Cream switch recordings by <a className="underline" href="https://github.com/tplai/kbsim" target="_blank" rel="noreferrer">Thomas Lai</a>. Adapted under the <a className="underline" href="/sounds/keyboard/LICENSE.txt" target="_blank" rel="noreferrer">MIT license</a>.</p>
        </div>}

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
              <SectionTitle>Portfolio session</SectionTitle>
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
                ref={resetButton} type="button" onClick={() => setResetOpen(true)}
                className={styles.resetButton}
              >
                <AlertTriangle size={16} />
                Reset portfolio settings
              </button>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                Restore this website’s preferences. Your notes, drafts, folders, and introduction status stay safe.
              </p>
              {resetStatus && <p className="mt-3 text-sm leading-6" role="status">{resetStatus}</p>}
            </div>
          </div>
        )}
      </div>
      {resetOpen && <PortfolioResetDialog returnFocus={resetButton} onCancel={() => setResetOpen(false)} onReset={handlePreferenceReset} />}
    </div>
  );
}
