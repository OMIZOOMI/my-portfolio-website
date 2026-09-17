"use client";

import React from "react";
import { useSystemStore } from "../window-manager/useSystemStore";
import { useWindowStore } from "../window-manager/useWindowStore";
import { DesktopIcon } from "./DesktopIcon";

export function BinWindow({ window: win }: { window: { id: string; title: string } }) {
  void win; // kept for WindowManager prop parity
  
  const trashItems = useSystemStore((s) => s.trashItems);
  const emptyTrash = useSystemStore((s) => s.emptyTrash);
  const getFileItem = useSystemStore((s) => s.getFileItem);
  const fileSystem = useSystemStore((s) => s.fileSystem);

  // For Bin, we need a way to navigate within the same window
  // We'll use a local state for current folder
  const [currentFolderId, setCurrentFolderId] = React.useState("bin");

  const [history, setHistory] = React.useState<string[]>(["bin"]);

  const currentFolderItems = React.useMemo(() => {
    if (currentFolderId === "bin") {
      return trashItems.map((id) => getFileItem(id) ?? { id, name: id, type: "file" as const });
    }
    return (fileSystem[currentFolderId] || []).filter(
      (item) => !useSystemStore.getState().isHidden(item.id)
    );
  }, [currentFolderId, trashItems, fileSystem, getFileItem]);

  const navigateTo = (folderId: string) => {
    if (folderId === "bin") {
      setCurrentFolderId("bin");
      setHistory((h) => [...h.slice(0, history.indexOf(currentFolderId) + 1), "bin"]);
    } else if (fileSystem[folderId]) {
      setCurrentFolderId(folderId);
      setHistory((h) => [...h.slice(0, history.indexOf(currentFolderId) + 1), folderId]);
    }
  };

  return (
    <div className="flex w-full h-full bg-[#f4f4f4]/95 text-gray-800 dark:bg-[#1e1e1e]/90 dark:text-gray-200 select-none font-sans flex-row">
      {/* Sidebar */}
      <div className="w-44 bg-[#ebebeb] border-r border-gray-300 dark:bg-black/30 dark:border-white/10 p-3 flex flex-col gap-1">
        <h3 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1 px-2 uppercase tracking-wider">Favorites</h3>
        <button
          data-drop-folder-id="desktop"
          onClick={() => navigateTo("desktop")}
          className={`text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
            currentFolderId === "desktop" ? "bg-[var(--system-accent)] text-white" : "hover:bg-gray-300/60 dark:hover:bg-white/10"
          }`}
        >
          Desktop
        </button>
        <button
          data-drop-folder-id="documents"
          onClick={() => navigateTo("documents")}
          className={`text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
            currentFolderId === "documents" ? "bg-[var(--system-accent)] text-white" : "hover:bg-gray-300/60 dark:hover:bg-white/10"
          }`}
        >
          Documents
        </button>
        <button
          data-drop-folder-id="bin"
          onClick={() => navigateTo("bin")}
          className={`text-left text-sm px-3 py-1.5 rounded-md text-white transition-colors ${
            currentFolderId === "bin" ? "bg-[var(--system-accent)] text-white" : "hover:bg-gray-300/60 dark:hover:bg-white/10"
          }`}
        >
          Bin
        </button>
      </div>

      {/* Main View */}
      <div className="flex-1 flex flex-col bg-white dark:bg-[#1e1e1e]">
        {/* Toolbar */}
        <div className="h-12 border-b border-gray-200 dark:border-white/10 flex items-center justify-between px-4 bg-gray-100 dark:bg-white/5">
          <div className="flex gap-2">
            <button 
              onClick={() => {
                if (history.length > 1) {
                  const newHistory = history.slice(0, -1);
                  setHistory(newHistory);
                  setCurrentFolderId(newHistory[newHistory.length - 1]);
                }
              }} 
              disabled={history.length <= 1}
              className="px-2 py-1 bg-gray-200 dark:bg-white/10 rounded opacity-30 hover:opacity-100 disabled:opacity-30">
            {"<"}
            </button>
            <button disabled className="px-2 py-1 bg-gray-200 dark:bg-white/10 rounded opacity-30">{">"}</button>
            <span className="text-sm font-semibold ml-4 text-gray-600 dark:text-gray-300">Bin</span>
          </div>
          
          {/* Empty Trash Button */}
          <button 
            onClick={emptyTrash}
            disabled={trashItems.length === 0}
            className="px-4 py-1 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-white/10 dark:hover:bg-white/20 active:bg-white/30 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Empty
          </button>
        </div>

        {/* Dynamic Files Grid */}
        <div className="flex-1 p-6 flex flex-wrap gap-8 content-start overflow-y-auto">
          {currentFolderItems.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
              {currentFolderId === "bin" ? "The Bin is empty." : "This folder is empty."}
            </div>
          ) : (
            currentFolderItems.map((item) => (
              <div key={item.id} className={currentFolderId === "bin" ? "opacity-70 grayscale" : ""}>
                <DesktopIcon 
                  label={item.name}
                  variant={item.type}
                  onOpen={() => {
                    if (currentFolderId === "bin") {
                      console.log("Cannot open trashed files");
                    } else if (item.type === "folder") {
                      navigateTo(item.id);
                    } else {
                      useWindowStore.getState().openWindow({
                        id: `file-${item.id}`,
                        kind: "file-viewer",
                        title: item.name,
                      });
                    }
                  }}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}