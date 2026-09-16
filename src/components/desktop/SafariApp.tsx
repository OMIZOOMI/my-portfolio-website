"use client";

import React from "react";
import { ChevronLeft, ChevronRight, Shield, Plus } from "lucide-react";

// 1. Created custom SVG components to replace the removed Lucide brand icons
const GithubIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.2c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
    <path d="M9 18c-4.51 2-5-2-7-2"/>
  </svg>
);

const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
    <rect width="4" height="12" x="2" y="9"/>
    <circle cx="4" cy="4" r="2"/>
  </svg>
);

export function SafariApp({ window }: { window: any }) {
  return (
    <div className="flex flex-col w-full h-full bg-[#1e1e1e] text-gray-200 font-sans">
      {/* Safari Top Bar */}
      <div className="h-12 bg-[#2d2d2d] border-b border-black/50 flex items-center px-4 justify-between">
        <div className="flex gap-4">
          <div className="flex gap-2">
            <ChevronLeft size={20} className="text-gray-500" />
            <ChevronRight size={20} className="text-gray-500" />
          </div>
          <Shield size={16} className="text-gray-400" />
        </div>
        
        {/* URL Bar */}
        <div className="flex-1 max-w-md mx-4 bg-[#1a1a1a] border border-white/10 rounded-md py-1 text-center flex items-center justify-center gap-2">
          <span className="text-xs text-gray-300 font-medium tracking-wide">omsawkare.dev</span>
        </div>

        <Plus size={20} className="text-gray-400" />
      </div>

      {/* Web Content */}
      <div className="flex-1 bg-[#121212] overflow-y-auto p-10 flex flex-col items-center">
        <h1 className="text-3xl font-bold text-white mb-2">Connect with me.</h1>
        <p className="text-gray-400 mb-10 text-sm">Explore my repositories and professional experience.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          {/* GitHub Card */}
          <a href="https://github.com/OMIZOOMI" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center bg-[#1e1e1e] border border-white/10 hover:border-white/30 rounded-2xl p-8 transition-all hover:scale-105 group cursor-pointer">
            <GithubIcon className="mb-4 text-gray-400 group-hover:text-white transition-colors" />
            <h2 className="text-lg font-semibold text-white">GitHub</h2>
            <p className="text-xs text-gray-500 mt-2 text-center">View my latest commits and project repositories.</p>
          </a>

          {/* LinkedIn Card */}
          {/* 2. Fixed the href by adding https:// */}
          <a href="https://www.linkedin.com/in/om-sawkare" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center bg-[#1e1e1e] border border-white/10 hover:border-blue-500/50 rounded-2xl p-8 transition-all hover:scale-105 group cursor-pointer">
            <LinkedinIcon className="mb-4 text-blue-500 opacity-80 group-hover:opacity-100 transition-opacity" />
            <h2 className="text-lg font-semibold text-white">LinkedIn</h2>
            <p className="text-xs text-gray-500 mt-2 text-center">Connect with me professionally.</p>
          </a>
        </div>
      </div>
    </div>
  );
}