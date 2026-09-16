"use client";

import React from "react";
import { useSystemStore } from "../window-manager/useSystemStore";
import { DesktopIcon } from "./DesktopIcon";

export function BinWindow({ window }: { window: any }) {
  const trashItems = useSystemStore((s) => s.trashItems);
  const emptyTrash = useSystemStore((s) => s.emptyTrash);
  const getFileItem = useSystemStore((s) => s.getFileItem);

  const trashedFilesData = trashItems.map((id) => {
    return getFileItem(id) ?? { id, name: id, type: "file" as const };
  });

  return (
    <div className="flex w-full h-full bg-[#1e1e1e]/90 text-gray-200 select-none font-sans flex-row">
      {/* Sidebar */}
      <div className="w-44 bg-black/30 border-r border-white/10 p-3 flex flex-col gap-1">
        <h3 className="text-[11px] font-bold text-gray-400 mb-1 px-2 uppercase tracking-wider">Favorites</h3>
        <div className="text-left text-sm px-3 py-1.5 rounded-md hover:bg-white/10 opacity-50">Desktop</div>
        <div className="text-left text-sm px-3 py-1.5 rounded-md hover:bg-white/10 opacity-50">Documents</div>
        <div className="text-left text-sm px-3 py-1.5 rounded-md hover:bg-white/10 opacity-50">Downloads</div>
        <div className="text-left text-sm px-3 py-1.5 rounded-md bg-blue-500/80 text-white mt-2">Bin</div>
      </div>

      {/* Main View */}
      <div className="flex-1 flex flex-col bg-[#1e1e1e]">
        {/* Toolbar */}
        <div className="h-12 border-b border-white/10 flex items-center justify-between px-4 bg-white/5">
          <div className="flex gap-2">
            <button disabled className="px-2 py-1 bg-white/10 rounded opacity-30">{"<"}</button>
            <button disabled className="px-2 py-1 bg-white/10 rounded opacity-30">{">"}</button>
            <span className="text-sm font-semibold ml-4 text-gray-300">Bin</span>
          </div>
          
          {/* Empty Trash Button */}
          <button 
            onClick={emptyTrash}
            disabled={trashItems.length === 0}
            className="px-4 py-1 text-sm bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Empty
          </button>
        </div>

        {/* Dynamic Files Grid */}
        <div className="flex-1 p-6 flex flex-wrap gap-8 content-start overflow-y-auto">
          {trashedFilesData.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
              The Bin is empty.
            </div>
          ) : (
            trashedFilesData.map((item) => (
              <div key={item.id} className="opacity-70 grayscale">
                <DesktopIcon 
                  label={item.name}
                  variant={item.type}
                  onOpen={() => console.log("Cannot open trashed files")}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}