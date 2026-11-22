"use client";

import { GlassButton } from "../ui/PortfolioGlass";
import { openPortfolioApp } from "../desktop/visitorLaunchers";
import styles from "./SecretNoteWindow.module.css";

export function SecretNoteWindow() {
  return <div className={styles.note}>
    <p>You found the secret file. Even a developer needs an arcade break once in a while.</p>
    <GlassButton type="button" onClick={() => openPortfolioApp("heat-sink")}>Play Heat Sink</GlassButton>
  </div>;
}
