"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import styles from "./DesktopIcon.module.css";
import { useSystemStore } from "../window-manager/useSystemStore";
import { useFileInteractionStore } from "./useFileInteractionStore";
import { FolderRenameInput } from "./FolderRenameInput";

// 1. Importing your local asset!
import FolderIconImg from "../../assets/FolderIcon.png";

interface DesktopIconProps {
  label: string;
  variant: "file" | "app" | "folder"; 
  glyph?: ReactNode; 
  accent?: string; 
  onOpen: () => void;
  /** "desktop" (white labels for wallpapers) or "window" (theme-aware labels). */
  tone?: "desktop" | "window";
  layout?: "desktop" | "finder";
  selected?: boolean;
  onSelect?: () => void;
  surfaceId?: string;
  itemId?: string;
}

export function DesktopIcon({ label, variant, glyph, accent = "#4c8dff", onOpen, tone = "desktop", layout = "desktop", selected = false, onSelect, surfaceId, itemId }: DesktopIconProps) {
  const isFileDragging = useSystemStore((s) => s.isDragging);
  const reduceMotion = useSystemStore((s) => s.reduceMotion);
  const prefersReducedMotion = useReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pointerPress = useRef<number | null>(null);
  const suppressPointerActivation = useRef(false);
  const acceptedPointerClicks = useRef(0);
  const ownSelected = useFileInteractionStore((state) => surfaceId && itemId ? state.selections[surfaceId] === itemId : false);
  const rename = useFileInteractionStore((state) => state.rename?.surfaceId === surfaceId && state.rename?.itemId === itemId ? state.rename : null);
  const isSelected = surfaceId && itemId ? ownSelected : selected;
  const animate = layout !== "finder" && !isFileDragging && !reduceMotion && !prefersReducedMotion;

  // DragOverlay clears the drag store during pointerup, before the browser can
  // dispatch click/dblclick. Remember the actual shared drag decision so a
  // completed drag cannot turn into an accidental folder activation.
  useEffect(() => useSystemStore.subscribe((state) => {
    if (pointerPress.current !== null && state.isDragging && state.draggedItem?.id === itemId && state.dragPointerId === pointerPress.current) {
      suppressPointerActivation.current = true;
      pointerPress.current = null;
    }
  }), [itemId]);

  const select = () => {
    if (surfaceId && itemId) useFileInteractionStore.getState().selectItem(surfaceId, itemId);
    onSelect?.();
  };

  return (
    <div className={`${styles.iconShell} ${layout === "finder" ? styles.finderShell : ""}`} data-file-icon-shell={itemId}>
    <motion.button
      ref={buttonRef}
      type="button"
      className={`${styles.icon} ${layout === "finder" ? styles.finderIcon : ""} cursor-grab select-none`}
      data-file-icon={itemId}
      data-selected={isSelected || undefined}
      data-editing={!!rename || undefined}
      aria-pressed={onSelect || surfaceId ? isSelected : undefined}
      onFocus={() => { if (!rename) select(); }}
      onPointerDown={(event) => {
        if (event.button !== 0 || rename) return;
        pointerPress.current = event.pointerId;
        suppressPointerActivation.current = false;
        select();
      }}
      onPointerUp={() => { pointerPress.current = null; }}
      onPointerCancel={() => {
        pointerPress.current = null;
        suppressPointerActivation.current = true;
        acceptedPointerClicks.current = 0;
      }}
      onClick={(event) => {
        pointerPress.current = null;
        if (rename || isFileDragging || (event.detail !== 0 && suppressPointerActivation.current)) {
          event.preventDefault();
          event.stopPropagation();
          acceptedPointerClicks.current = 0;
          return;
        }
        select();
        // Assistive technology activates a button with a zero-detail click.
        // Physical Enter/Space are handled below and suppress native clicks.
        if (event.detail === 0) {
          onOpen();
          return;
        }
        acceptedPointerClicks.current = event.detail === 1 ? 1 : acceptedPointerClicks.current + 1;
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey || isFileDragging || rename) return;
        select();
        onOpen();
      }}
      onKeyUp={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!rename && !isFileDragging && !suppressPointerActivation.current && acceptedPointerClicks.current >= 2) onOpen();
      }}
      whileHover={animate && !rename ? { scale: 1.05, y: -2 } : undefined}
      whileTap={animate && !rename ? { scale: 0.97, y: 0 } : undefined}
      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
      aria-label={`Open ${label}`}
    >
      {/* ORIGINAL FILE VARIANT */}
      {variant === "file" && (
        <svg viewBox="0 0 48 56" className={styles.glyphSvg} aria-hidden="true">
          <path d="M4 4h28l12 12v36a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z" fill="#e8e9ec" />
          <path d="M32 4v12h12L32 4Z" fill="#c7c9ce" />
          <rect x="10" y="26" width="22" height="2.5" rx="1.25" fill="#a9abb1" />
          <rect x="10" y="33" width="22" height="2.5" rx="1.25" fill="#a9abb1" />
          <rect x="10" y="40" width="14" height="2.5" rx="1.25" fill="#a9abb1" />
        </svg>
      )}

      {/* 2. NEW LOCAL FOLDER IMAGE VARIANT */}
      {variant === "folder" && (
        <Image
          src={FolderIconImg}
          alt=""
          width={56}
          height={56}
          unoptimized
          loading="eager"
          className="pointer-events-none select-none drop-shadow-md"
          style={{ width: "56px", height: "56px", objectFit: "contain" }}
        />
      )}

      {/* ORIGINAL APP VARIANT */}
      {variant === "app" && (
        <div className={styles.appTile} style={{ background: `linear-gradient(160deg, ${accent}, ${accent}CC)` }}>
          {glyph}
        </div>
      )}
      
      <span className={`${styles.label} ${tone === "window" ? styles.labelWindow : ""}`}>{label}</span>
    </motion.button>
    {rename && <FolderRenameInput key={rename.token} session={rename} name={label} onRestoreFocus={() => buttonRef.current?.focus({ preventScroll: true })} />}
    </div>
  );
}
