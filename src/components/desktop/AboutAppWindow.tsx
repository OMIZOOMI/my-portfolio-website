"use client";

import React from "react";
import FinderIcon from "../../assets/3d-mac-os-finder.png";
import TerminalIcon from "../../assets/Terminal.png";
import NotesIcon from "../../assets/Notes.png";
import MailIcon from "../../assets/Mail.png";
import SafariIcon from "../../assets/safari.png";
import MusicIcon from "../../assets/Music.png";
import FaceTimeIcon from "../../assets/facetime.png";
import SettingsIcon from "../../assets/System-Settings.png";

// Map app names to their icons and versions
const APP_DATA: Record<string, { icon: string; version: string }> = {
  "Finder": { icon: FinderIcon.src, version: "Version 26.4" },
  "Terminal": { icon: TerminalIcon.src, version: "Version 2.15 (470.2)" },
  "Notes": { icon: NotesIcon.src, version: "Version 4.9.1" },
  "Mail": { icon: MailIcon.src, version: "Version 16.0" },
  "Safari": { icon: SafariIcon.src, version: "Version 17.4.1" },
  "Music": { icon: MusicIcon.src, version: "Version 1.4.4" },
  "FaceTime": { icon: FaceTimeIcon.src, version: "Version 5.0" },
  "Settings": { icon: SettingsIcon.src, version: "Version 15.0" },
  "About Me": { icon: FinderIcon.src, version: "Version 1.0" },
};

export function AboutAppWindow({ window }: { window: any }) {
  // Extract the app name from the window title (e.g., "About Terminal" -> "Terminal")
  const appName = window.title.replace("About ", "");
  const data = APP_DATA[appName] || APP_DATA["Finder"]; // Fallback to Finder

  return (
    <div className="w-full h-full flex flex-col items-center bg-[#282828] text-gray-200 font-sans p-5 pt-6 text-center select-none">
      <img 
        src={data.icon} 
        alt={appName} 
        draggable={false}
        className="w-20 h-20 drop-shadow-2xl mb-3 pointer-events-none"
      />
      <h1 className="text-xl font-bold text-white mb-1 tracking-wide">{appName}</h1>
      <p className="text-[11px] text-gray-400 mb-4">{data.version}</p>
      
      <div className="mt-auto mb-6 text-[11px] text-gray-500 leading-relaxed font-medium">
        <p>™ by omisan & © 2026 Om Sawkare.</p>
        <p>All rights reserved.</p>
      </div>
    </div>
  );
}