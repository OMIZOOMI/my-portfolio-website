"use client";

import React, { useState, useRef } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2 } from "lucide-react";

export function MusicApp({ window }: { window: any }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (isPlaying) audioRef.current?.pause();
    else audioRef.current?.play();
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="w-full h-full bg-[#1e1e1e]/95 backdrop-blur-xl flex flex-col text-white font-sans">
      {/* Hidden Audio Element (Using a royalty-free lo-fi beat placeholder) */}
      <audio ref={audioRef} loop src="https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3" />
      
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-40 h-40 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl shadow-2xl mb-6 flex items-center justify-center">
          <MusicIcon className="text-white/50 w-16 h-16" />
        </div>
        <h2 className="text-xl font-bold">Coding Lo-Fi</h2>
        <p className="text-gray-400 text-sm mt-1">Om's Portfolio Mix</p>
      </div>

      {/* Player Controls */}
      <div className="h-20 bg-black/40 border-t border-white/10 flex items-center justify-between px-6">
        <div className="flex gap-4 items-center w-1/3">
          <Volume2 size={16} className="text-gray-400" />
          <div className="w-20 h-1 bg-white/20 rounded-full"><div className="w-2/3 h-full bg-white rounded-full" /></div>
        </div>
        <div className="flex items-center gap-6">
          <SkipBack size={24} className="text-gray-300 hover:text-white cursor-pointer transition-colors" />
          <button onClick={togglePlay} className="w-10 h-10 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform text-black">
            {isPlaying ? <Pause fill="black" size={18} /> : <Play fill="black" size={18} className="ml-1" />}
          </button>
          <SkipForward size={24} className="text-gray-300 hover:text-white cursor-pointer transition-colors" />
        </div>
        <div className="w-1/3" /> {/* Spacer */}
      </div>
    </div>
  );
}

const MusicIcon = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
);
