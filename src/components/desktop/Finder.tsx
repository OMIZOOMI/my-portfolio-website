"use client";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useSystemStore } from "../window-manager/useSystemStore";
import React, { useState, useEffect } from "react";
import { DesktopIcon } from "./DesktopIcon";
import { beginFilePointerDrag } from "./beginFilePointerDrag";
import type { FileItem } from "../../data/fileSystem";

interface FinderDragItemProps {
  item: FileItem;
  fromFolder: string;
  isDragging: boolean;
  isDropTarget: boolean;
  isHidden: (id: string) => boolean;
  navigateTo: (folderId: string) => void;
}

function FinderDragItem({
  item,
  fromFolder,
  isDragging,
  isDropTarget,
  isHidden,
  navigateTo,
}: FinderDragItemProps) {
  return (
    <div
      data-file-item={item.id}
      data-drop-folder-id={item.type === "folder" ? item.id : undefined}
      onPointerDown={(e) =>
        beginFilePointerDrag(e, {
          id: item.id,
          name: item.name,
          iconType: item.type,
          source: "finder",
          sourceFolderId: fromFolder,
        })
      }
      className={`cursor-grab select-none touch-none transition-opacity duration-150 ${
        isDragging ? "opacity-40 scale-[0.97] saturate-50" : "opacity-100"
      } ${isDropTarget ? "ring-2 ring-blue-400/80 rounded-xl bg-white/10" : ""}`}
    >
      <DesktopIcon
        label={item.name}
        variant={item.type}
        onOpen={() => {
          if (isHidden(item.id)) return;
          if (item.type === "folder") {
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
  );
}

export function Finder({ window }: { window: { id: string; title: string } }) {
  const fileSystem = useSystemStore((s) => s.fileSystem);
  const startFolder = window?.title?.toLowerCase().replace(" ", "-") || "desktop";

  const [history, setHistory] = useState<string[]>([fileSystem[startFolder] ? startFolder : "desktop"]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const activeDragId = useSystemStore((s) => s.draggedItem?.id ?? null);
  const dropTarget = useSystemStore((s) => s.dropTarget);
  const dropFolderId = useSystemStore((s) => s.dropFolderId);
  const isFileDragging = useSystemStore((s) => s.isDragging);

  const currentFolderId = history[currentIndex];

  const trashItems = useSystemStore((s) => s.trashItems);
  const deletedIds = useSystemStore((s) => s.deletedIds);
  const desktopIds = useSystemStore((s) => s.desktopIds);

  const isHidden = (id: string) => trashItems.includes(id) || deletedIds.includes(id);

  const isCurrentFolderTrashed = trashItems.includes(currentFolderId);
  const isCurrentFolderDeleted = deletedIds.includes(currentFolderId);
  const isCurrentFolderGone = isCurrentFolderTrashed || isCurrentFolderDeleted;

  const items = React.useMemo(() => {
    if (isCurrentFolderGone) return [];
    if (currentFolderId === "desktop") {
      return desktopIds
        .map((id) => useSystemStore.getState().getFileItem(id) ?? { id, name: id, type: "folder" as const })
        .filter((item) => !isHidden(item.id));
    }
    return (fileSystem[currentFolderId] || []).filter(
      (item) => !isHidden(item.id) && !desktopIds.includes(item.id)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId, isCurrentFolderGone, trashItems, deletedIds, desktopIds, fileSystem]);

  useEffect(() => {
    if (window?.id) {
      const formattedTitle = currentFolderId
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      useWindowStore.setState((state) => {
        if (!state.windows[window.id]) return state;
        return {
          windows: {
            ...state.windows,
            [window.id]: {
              ...state.windows[window.id],
              title: formattedTitle,
            },
          },
        };
      });
    }
  }, [currentFolderId, window?.id]);

  const navigateTo = (folderId: string) => {
    if (!fileSystem[folderId] && folderId !== "desktop") return;
    if (trashItems.includes(folderId) || deletedIds.includes(folderId)) return;
    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push(folderId);
    setHistory(newHistory);
    setCurrentIndex(currentIndex + 1);
  };

  const contentIsDropTarget =
    isFileDragging && dropTarget === "finder" && dropFolderId === currentFolderId && activeDragId !== currentFolderId;

  return (
    <div className="flex w-full h-full bg-[#1e1e1e]/90 text-gray-200 select-none font-sans flex-row">
      <div className="w-44 bg-black/30 border-r border-white/10 p-3 flex flex-col gap-1">
        <h3 className="text-[11px] font-bold text-gray-400 mb-1 px-2 uppercase tracking-wider">Favorites</h3>
        <button
          data-drop-folder-id="desktop"
          onClick={() => navigateTo("desktop")}
          className={`text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
            currentFolderId === "desktop" ? "bg-blue-500/80 text-white" : "hover:bg-white/10"
          } ${isFileDragging && dropFolderId === "desktop" && dropTarget === "finder" ? "ring-2 ring-blue-400/80" : ""}`}
        >
          Desktop
        </button>
        <button
          data-drop-folder-id="documents"
          onClick={() => navigateTo("documents")}
          className={`text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
            currentFolderId === "documents" ? "bg-blue-500/80 text-white" : "hover:bg-white/10"
          } ${isFileDragging && dropFolderId === "documents" && dropTarget === "finder" ? "ring-2 ring-blue-400/80" : ""}`}
        >
          Documents
        </button>
      </div>

      <div className="flex-1 flex flex-col bg-[#1e1e1e]">
        <div className="h-12 border-b border-white/10 flex items-center px-4 gap-4 bg-white/5">
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 disabled:opacity-30"
            >
              {"<"}
            </button>
            <button
              onClick={() => setCurrentIndex(Math.min(history.length - 1, currentIndex + 1))}
              disabled={currentIndex === history.length - 1}
              className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 disabled:opacity-30"
            >
              {">"}
            </button>
          </div>
          <div className="text-sm font-semibold capitalize text-gray-300">{currentFolderId.replace("-", " ")}</div>
        </div>

        <div
          data-finder-content={currentFolderId}
          className={`flex-1 p-6 flex flex-wrap gap-8 content-start ${
            isFileDragging ? "overflow-visible" : "overflow-y-auto"
          } ${contentIsDropTarget ? "ring-2 ring-inset ring-blue-400/40 bg-blue-500/5" : ""}`}
        >
          {isCurrentFolderGone ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-center gap-3 py-16">
              <div className="text-4xl">{isCurrentFolderDeleted ? "🗑️" : "🚫"}</div>
              <p className="text-sm font-semibold text-gray-200">
                {isCurrentFolderDeleted ? "This folder was permanently deleted." : "This folder was moved to the Bin."}
              </p>
              <p className="text-xs text-gray-500">
                {isCurrentFolderDeleted ? "Emptying the Bin cannot be undone." : "Its contents were moved with it."}
              </p>
              <button
                onClick={() => navigateTo("desktop")}
                className="mt-2 px-4 py-1.5 text-sm bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-md transition-colors"
              >
                Go to Desktop
              </button>
            </div>
          ) : (
            items.map((item) => (
              <FinderDragItem
                key={item.id}
                item={item}
                fromFolder={currentFolderId}
                isDragging={activeDragId === item.id}
                isDropTarget={
                  item.type === "folder" &&
                  isFileDragging &&
                  dropTarget === "finder" &&
                  dropFolderId === item.id &&
                  activeDragId !== item.id
                }
                isHidden={isHidden}
                navigateTo={navigateTo}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
