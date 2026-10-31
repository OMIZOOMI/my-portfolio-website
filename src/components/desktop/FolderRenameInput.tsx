"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useSystemStore } from "../window-manager/useSystemStore";
import { useFileInteractionStore, type FolderRenameSession } from "./useFileInteractionStore";
import styles from "./FolderRenameInput.module.css";

export function FolderRenameInput({ session, name, onRestoreFocus }: {
  session: FolderRenameSession;
  name: string;
  onRestoreFocus: () => void;
}) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useLayoutEffect(() => {
    // A rapid series of New Folder actions must leave the newest editor focused.
    if (useFileInteractionStore.getState().rename?.token !== session.token) return;
    inputRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, [session.token]);

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
    {error && <span className={styles.error} id={`rename-error-${session.token}`} role="alert">{error}</span>}
  </div>;
}
