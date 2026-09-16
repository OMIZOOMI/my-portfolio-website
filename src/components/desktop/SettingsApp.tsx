"use client";

import React from "react";
import { useSystemStore } from "../window-manager/useSystemStore";
import { Moon, Sun, Monitor } from "lucide-react";

const WALLPAPERS = [
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564", // macOS Graphic
  "https://images.unsplash.com/photo-1506744626753-eda814117714?q=80&w=2564", // Mountains
];

export function SettingsApp({ window }: { window: any }) {
  const { theme, setTheme, wallpaper, setWallpaper } = useSystemStore();

  return (
    <div className="w-full h-full bg-[#1e1e1e] text-gray-200 font-sans flex">
      {/* Sidebar */}
      <div className="w-48 bg-black/20 border-r border-white/10 p-2">
        <div className="px-3 py-2 bg-blue-500/20 text-blue-400 rounded-md text-sm font-medium">Appearance</div>
      </div>

      {/* Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6 text-white">Appearance</h2>
        
        {/* Theme Toggle */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Mode</h3>
          <div className="flex gap-4">
            <button onClick={() => setTheme("light")} className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${theme === 'light' ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 hover:border-white/30'}`}>
              <Sun size={24} className={theme === 'light' ? 'text-blue-400' : 'text-gray-400'} />
              <span className="text-sm font-medium">Light</span>
            </button>
            <button onClick={() => setTheme("dark")} className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${theme === 'dark' ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 hover:border-white/30'}`}>
              <Moon size={24} className={theme === 'dark' ? 'text-blue-400' : 'text-gray-400'} />
              <span className="text-sm font-medium">Dark</span>
            </button>
          </div>
        </div>

        {/* Wallpaper Picker */}
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Wallpaper</h3>
          <div className="flex gap-4">
            {WALLPAPERS.map((url, i) => (
              <button 
                key={i} 
                onClick={() => setWallpaper(url)}
                className={`w-32 h-20 rounded-lg bg-cover bg-center border-2 transition-all ${wallpaper === url ? 'border-blue-500 scale-105' : 'border-transparent hover:border-white/30'}`}
                style={{ backgroundImage: `url(${url})` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
