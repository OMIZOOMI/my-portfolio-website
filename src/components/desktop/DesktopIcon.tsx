"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import styles from "./DesktopIcon.module.css";

// 1. Importing your local asset!
import FolderIconImg from "../../assets/FolderIcon.png";

interface DesktopIconProps {
  label: string;
  variant: "file" | "app" | "folder"; 
  glyph?: ReactNode; 
  accent?: string; 
  onOpen: () => void;
}

export function DesktopIcon({ label, variant, glyph, accent = "#4c8dff", onOpen }: DesktopIconProps) {
  return (
    <motion.button
      type="button"
      className={`${styles.icon} cursor-grab select-none`}
      onDoubleClick={onOpen}
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.97, y: 0 }}
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
        <img 
          src={FolderIconImg.src} 
          alt="Folder" 
          draggable={false}
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
      
      <span className={styles.label}>{label}</span>
    </motion.button>
  );
}