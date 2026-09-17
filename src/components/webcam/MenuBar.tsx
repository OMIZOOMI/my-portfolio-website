"use client";

import React, { useEffect, useRef, useState } from "react";
import { Wifi, BatteryFull, BatteryMedium, BatteryLow } from "lucide-react";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useSystemStore } from "../window-manager/useSystemStore";

// Simple counter for unique window IDs without impure functions during render
let windowIdCounter = 0;
function generateWindowId(prefix: string): string {
  windowIdCounter++;
  return `${prefix}-${windowIdCounter}-${Date.now()}`;
}

// --- Time Hook ---
function useAccurateClock() {
  const [time, setTime] = useState<Date | null>(null);
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;
    const syncClock = () => {
      const now = new Date();
      setTime(now);
      const msUntilNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
      timeoutId = setTimeout(() => {
        setTime(new Date());
        intervalId = setInterval(() => setTime(new Date()), 60000);
      }, msUntilNextMinute);
    };
    syncClock();
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, []);
  return time;
}

// --- Battery Hook ---
interface BatteryLike extends EventTarget {
  level: number;
}
function useBattery() {
  const [level, setLevel] = useState<number>(100);
  useEffect(() => {
    let mounted = true;
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (typeof nav.getBattery === "function") {
      nav.getBattery().then((battery: BatteryLike) => {
        if (!mounted) return;
        setLevel(Math.round(battery.level * 100));
        battery.addEventListener("levelchange", () => {
          if (mounted) setLevel(Math.round(battery.level * 100));
        });
      }).catch(() => { if (mounted) setLevel(100); });
    }
    return () => { mounted = false; };
  }, []);
  return level;
}

// --- App Name Mapping ---
const APP_NAMES: Record<string, string> = {
  "finder": "Finder",
  "terminal": "Terminal",
  "safari": "Safari",
  "notes": "Notes",
  "mail": "Mail",
  "music": "Music",
  "settings": "Settings",
  "facetime": "FaceTime",
  "about-app": "Finder", // Modals inherit Finder context
  "about-me": "About Me",
  "file-viewer": "Preview",
  "neural-block": "Neural Block",
  "bin": "Finder" // Bin inherits Finder context
};

export function MenuBar() {
  const time = useAccurateClock();
  const batteryLevel = useBattery();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // --- Undo/Redo history state ---
  const canUndo = useSystemStore((s) => s.past.length > 0);
  const canRedo = useSystemStore((s) => s.future.length > 0);

  // Global ⌘Z / ⇧⌘Z (Ctrl on Windows/Linux). Skip while typing so native
  // text-field undo keeps working.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) {
        useSystemStore.getState().redo();
      } else {
        useSystemStore.getState().undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // --- Dynamic App Focus State ---
  const { windows, focusedWindowId } = useWindowStore();
  const activeAppKind = focusedWindowId ? windows[focusedWindowId]?.kind : "finder";
  const activeAppName = APP_NAMES[activeAppKind] || "Finder";

  const timeString = time ? time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : "";
  const dateString = time ? time.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : "";
  const BatteryIcon = batteryLevel > 70 ? BatteryFull : batteryLevel > 30 ? BatteryMedium : BatteryLow;

  const topLevelMenus = ["", activeAppName, "File", "Edit", "View", "Go", "Window", "Help"];

  const DYNAMIC_MENU_ITEMS: Record<string, string[]> = {
    "": ["About This Mac", "System Settings...", "Restart", "Shut Down"],
    [activeAppName]: [`About ${activeAppName}`, "Preferences...", "Empty Trash"],
    "File": ["New Finder Window", "New Folder", "Close Window"],
    "Edit": ["Undo", "Redo", "Cut", "Copy", "Paste"],
    "View": ["Show Sidebar", "Show Path Bar", "Show Status Bar"],
    "Go": ["Desktop", "Documents", "Bin"],
    "Window": ["Minimize", "Zoom", "Bring All to Front"],
    "Help": ["About This Portfolio", "GitHub Repository", "Documentation"],
  };

  const handleMenuClick = (menu: string) => {
    if (DYNAMIC_MENU_ITEMS[menu]) {
      setActiveMenu(activeMenu === menu ? null : menu);
    }
  };

  const handleMenuHover = (menu: string) => {
    if (activeMenu !== null && DYNAMIC_MENU_ITEMS[menu]) {
      setActiveMenu(menu);
    }
  };

  const handleMenuItemAction = (menu: string, item: string) => {
    setActiveMenu(null); 

    if (menu === "Edit") {
      if (item === "Undo" && useSystemStore.getState().past.length > 0) {
        useSystemStore.getState().undo();
      } else if (item === "Redo" && useSystemStore.getState().future.length > 0) {
        useSystemStore.getState().redo();
      }
      return;
    }

    if (menu === "File") {
      if (item === "New Finder Window") {
        const uniqueId = generateWindowId("finder");
        useWindowStore.getState().openWindow({
          id: uniqueId,
          kind: "finder",
          title: "Desktop"
        });
      } else if (item === "New Folder") {
        // Could add folder creation logic here
        console.log("New Folder requested");
      } else if (item === "Close Window") {
        const { focusedWindowId, closeWindow } = useWindowStore.getState();
        if (focusedWindowId) {
          closeWindow(focusedWindowId);
        }
      }
      return;
    }

    if (menu === "Edit") {
      if (item === "Undo" && useSystemStore.getState().past.length > 0) {
        useSystemStore.getState().undo();
      } else if (item === "Redo" && useSystemStore.getState().future.length > 0) {
        useSystemStore.getState().redo();
      }
      return;
    }

    if (menu === "View") {
      // View actions - could toggle sidebar, path bar, etc.
      if (item === "Show Sidebar") {
        console.log("Toggle sidebar");
      }
      return;
    }

    if (menu === "Go") {
      if (item === "Desktop") {
        useWindowStore.getState().openWindow({
          id: "finder-desktop",
          kind: "finder",
          title: "Desktop"
        });
      } else if (item === "Documents") {
        useWindowStore.getState().openWindow({
          id: "finder-documents",
          kind: "finder",
          title: "Documents"
        });
      } else if (item === "Bin") {
        useWindowStore.getState().openWindow({
          id: "bin-window",
          kind: "bin",
          title: "Bin"
        });
      }
      return;
    }

    if (menu === "Window") {
      const { focusedWindowId, toggleMinimize, closeWindow } = useWindowStore.getState();
      if (item === "Minimize" && focusedWindowId) {
        toggleMinimize(focusedWindowId);
      } else if (item === "Zoom" && focusedWindowId) {
        // Toggle maximize - would need maximize support in window store
        console.log("Zoom window");
      } else if (item === "Bring All to Front") {
        console.log("Bring all to front");
      }
      return;
    }

    if (menu === "Help") {
      if (item === "About This Portfolio") {
        useWindowStore.getState().openWindow({
          id: "about-portfolio",
          kind: "about-app",
          title: "About This Portfolio",
          size: { width: 400, height: 400 }
        });
      } else if (item === "GitHub Repository") {
        window.open("https://github.com/OMIZOOMI/my-portfolio-website", "_blank");
      } else if (item === "Documentation") {
        window.open("https://github.com/OMIZOOMI/my-portfolio-website#readme", "_blank");
      }
      return;
    }

    if (menu === activeAppName) {
      if (item === `About ${activeAppName}`) {
        // Dispatches to the unified generic AboutAppWindow component
        useWindowStore.getState().openWindow({ 
          id: `about-${activeAppName.toLowerCase().replace(/\s+/g, '-')}`, 
          kind: "about-app", 
          title: `About ${activeAppName}`,
          size: { width: 300, height: 320 } 
        });
      } else if (item === "Preferences...") {
        // Same app id the Dock uses ("app-settings") so the store's id check
        // hits; the kind-based single-instance rule covers any stragglers.
        useWindowStore.getState().openWindow({
          id: "app-settings",
          kind: "settings",
          title: "Settings"
        });
      } else if (item === "Empty Trash") {
        useSystemStore.getState().emptyTrash();
      }
    }
  };

  return (
    <>
      {activeMenu && (
        <div onClick={() => setActiveMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
      )}

      <nav
        aria-label="macOS Menu Bar"
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "28px",
          background: "rgba(0, 0, 0, 0.25)", backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)", display: "flex", justifyContent: "space-between",
          alignItems: "center", padding: "0 16px", color: "rgba(255, 255, 255, 0.95)",
          fontSize: "13px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontWeight: 500, letterSpacing: "0.3px", zIndex: 9999,
          WebkitUserSelect: "none", MozUserSelect: "none", msUserSelect: "none", userSelect: "none", 
        }}
      >
        <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
          {topLevelMenus.map((menu) => (
            <div
              key={menu}
              onClick={() => handleMenuClick(menu)}
              onMouseEnter={(e) => {
                handleMenuHover(menu);
                if (activeMenu !== menu) e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
              }}
              onMouseLeave={(e) => {
                if (activeMenu !== menu) e.currentTarget.style.background = "transparent";
              }}
              style={{
                position: "relative", height: "100%", display: "flex", alignItems: "center",
                padding: "0 10px", cursor: "pointer", 
                background: activeMenu === menu ? "rgba(255, 255, 255, 0.2)" : "transparent",
                borderRadius: "4px",
                fontWeight: menu === activeAppName ? 700 : 500,
                fontSize: menu === "" ? "15px" : "13px",
                transition: "background 0.1s ease",
              }}
            >
              {menu}

              {activeMenu === menu && DYNAMIC_MENU_ITEMS[menu] && (
                <div
                  style={{
                    position: "absolute", top: "28px", left: 0, minWidth: "200px",
                    background: "rgba(40, 40, 45, 0.85)", backdropFilter: "blur(25px)",
                    WebkitBackdropFilter: "blur(25px)", border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "6px", padding: "4px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                    display: "flex", flexDirection: "column",
                  }}
                >
                  {DYNAMIC_MENU_ITEMS[menu].map((item) => {
                    const isUndo = menu === "Edit" && item === "Undo";
                    const isRedo = menu === "Edit" && item === "Redo";
                    const disabled = (isUndo && !canUndo) || (isRedo && !canRedo);
                    return (
                      <div
                        key={item}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (disabled) return;
                          handleMenuItemAction(menu, item);
                        }}
                        style={{
                          padding: "4px 12px",
                          borderRadius: "4px",
                          cursor: disabled ? "default" : "pointer",
                          opacity: disabled ? 0.4 : 1,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "24px",
                        }}
                        onMouseEnter={(e) => {
                          if (!disabled) e.currentTarget.style.background = "#0A60FF";
                        }}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span>{item}</span>
                        {isUndo && (
                          <span style={{ opacity: 0.6, fontSize: "12px" }}>⌘Z</span>
                        )}
                        {isRedo && (
                          <span style={{ opacity: 0.6, fontSize: "12px" }}>⇧⌘Z</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div
          aria-hidden="true"
          style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            top: 0, width: "160px", height: "28px", background: "#000",
            borderBottomLeftRadius: "12px", borderBottomRightRadius: "12px",
            boxShadow: "inset 0 -1px 1px rgba(255,255,255,0.1)", 
          }}
        />

        <div style={{ display: "flex", gap: "16px", alignItems: "center", cursor: "pointer", height: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "0 6px", borderRadius: "4px", height: "100%" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <Wifi size={15} strokeWidth={2.5} />
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", padding: "0 6px", borderRadius: "4px", height: "100%" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <span style={{ fontSize: "12px", opacity: 0.9 }}>{batteryLevel}%</span>
            <BatteryIcon size={16} strokeWidth={2} />
          </div>
          <span style={{ display: "flex", alignItems: "center", padding: "0 8px", borderRadius: "4px", height: "100%", transition: "background 0.1s ease" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            {dateString} {timeString}
          </span>
        </div>
      </nav>
    </>
  );
}