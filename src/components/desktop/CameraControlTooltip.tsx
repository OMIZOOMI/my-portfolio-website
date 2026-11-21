"use client";

import { useState, type ReactNode } from "react";
import styles from "./FaceTimeApp.module.css";

export function CameraControlTooltip({ id, text, suppressed = false, children }: { id: string; text: string; suppressed?: boolean; children: ReactNode }) {
  const [dismissed, setDismissed] = useState(false);
  return <span className={styles.controlWrap} data-tip-dismissed={dismissed || suppressed || undefined}
    onPointerEnter={() => setDismissed(false)} onPointerLeave={() => setDismissed(false)}
    onFocusCapture={() => setDismissed(false)} onBlurCapture={() => setDismissed(false)}
    onKeyDown={event => {
      if (event.key === "Escape" && !dismissed && !suppressed) { setDismissed(true); event.preventDefault(); event.stopPropagation(); }
    }}>
    {children}
    <span id={id} role="tooltip" className={styles.tooltip}>{text}</span>
  </span>;
}
