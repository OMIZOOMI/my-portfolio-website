"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useSystemStore } from "../window-manager/useSystemStore";
import { useFileInteractionStore, type FolderRenameSession } from "./useFileInteractionStore";
import { getDesktopCoordinateSpace, getVisibleDesktopBounds } from "../window-manager/desktopCoordinates";
import styles from "./FolderRenameInput.module.css";

export function FolderRenameInput({ session, name, onRestoreFocus }: {
  session: FolderRenameSession;
  name: string;
  onRestoreFocus: () => void;
}) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLSpanElement>(null);
  const finished = useRef(false);

  useLayoutEffect(() => {
    // A rapid series of New Folder actions must leave the newest editor focused.
    if (useFileInteractionStore.getState().rename?.token !== session.token) return;
    // Desktop focus capture scrolls only its icon board, never the projected
    // screen's outer ancestors. Files retains its ordinary grid scrolling.
    if (session.surfaceId !== "desktop") inputRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, [session.token, session.surfaceId]);

  useLayoutEffect(() => {
    if (!error) return;
    const root = document.getElementById("desktop-root");
    const message = errorRef.current;
    const editor = inputRef.current?.parentElement;
    if (!root || !message || !editor) return;
    const reposition = () => {
      const bounds = getVisibleDesktopBounds(root);
      const clientOrigin = getDesktopCoordinateSpace(editor)?.toClient({ x: 0, y: 0 });
      const origin = clientOrigin && getDesktopCoordinateSpace(root)?.toLocal(clientOrigin);
      if (!bounds || !origin) return;
      message.style.maxWidth = `${Math.min(200, bounds.width)}px`;
      const width = message.offsetWidth;
      const height = message.offsetHeight;
      const left = Math.max(bounds.left, Math.min(origin.x + (editor.clientWidth - width) / 2, bounds.right - width));
      const below = origin.y + editor.clientHeight + 5;
      const top = Math.max(bounds.top, Math.min(below + height <= bounds.bottom ? below : origin.y - height - 5, bounds.bottom - height));
      Object.assign(message.style, { left: `${left - origin.x}px`, top: `${top - origin.y}px`, transform: "none" });
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(root);
    observer.observe(message);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [error]);

  const finish = (restoreFocus: boolean) => {
    if (finished.current || useFileInteractionStore.getState().rename?.token !== session.token) return;
    finished.current = true;
    useFileInteractionStore.getState().finishRename(session.token);
    // The icon button remains mounted beside this editor. Restoring focus now
    // avoids a frame on body where the next Finder shortcut would be missed.
    if (restoreFocus && !useFileInteractionStore.getState().rename) onRestoreFocus();
  };

  const commit = (fromBlur: boolean) => {
    if (finished.current || useFileInteractionStore.getState().rename?.token !== session.token) return;
    const result = useSystemStore.getState().renameFolder(session.itemId, value);
    if (result.ok) finish(!fromBlur);
    else if (fromBlur) finish(false);
    else {
      setError(result.error);
      inputRef.current?.focus();
    }
  };

  return <div className={styles.editor} data-file-rename-editor
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onContextMenu={(event) => event.stopPropagation()}
  >
    <input ref={inputRef} className={styles.input} type="text" value={value}
      data-file-rename-input={session.itemId} aria-label={`Rename ${name}`}
      aria-invalid={!!error} aria-describedby={error ? `rename-error-${session.token}` : undefined}
      autoComplete="off" spellCheck={false} maxLength={255}
      onChange={(event) => { setValue(event.target.value); setError(""); }}
      onBlur={() => commit(true)}
      onKeyDown={(event) => {
        // Preserve the input's native selection and undo/redo behavior.
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") { event.preventDefault(); commit(false); }
        if (event.key === "Escape") { event.preventDefault(); finish(true); }
      }}
    />
    {error && <span ref={errorRef} className={styles.error} id={`rename-error-${session.token}`} role="alert">{error}</span>}
  </div>;
}
