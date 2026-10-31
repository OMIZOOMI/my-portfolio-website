"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./DesktopMenus.module.css";

export interface DesktopMenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export function DesktopMenus({ menus, appName, onPrepare }: {
  menus: { label: string; items: DesktopMenuItem[] }[];
  appName: string;
  onPrepare: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const openedByHover = useRef(false);
  const pendingFocus = useRef<"first" | "last" | null>(null);
  const dismiss = useCallback((restore: boolean) => {
    setOpenIndex(null);
    if (restore && openIndex !== null) triggers.current[openIndex]?.focus({ preventScroll: true });
  }, [openIndex]);
  const open = (index: number, edge: "first" | "last" = "first") => {
    openedByHover.current = false; onPrepare(); pendingFocus.current = edge; setFocusIndex(index); setOpenIndex(index);
  };
  useLayoutEffect(() => {
    if (openIndex === null || !pendingFocus.current) return;
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>('[role="menu"] [role="menuitem"]:not(:disabled)');
    const button = pendingFocus.current === "last" ? buttons?.[buttons.length - 1] : buttons?.[0];
    pendingFocus.current = null; button?.focus({ preventScroll: true });
  }, [openIndex]);
  useEffect(() => {
    if (openIndex === null) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) dismiss(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault(); event.stopPropagation(); dismiss(true);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape, true); };
  }, [openIndex, dismiss]);

  const neighbor = (index: number, direction: number) => (index + direction + menus.length) % menus.length;
  return <div ref={root} role="menubar" aria-label="Application menus" className={styles.bar}>
    {menus.map((menu, index) => <div key={menu.label} className={styles.group} data-menu-key={menu.label}
      onMouseEnter={() => { if (openIndex !== null && openIndex !== index) { open(index); openedByHover.current = true; } }}>
      <button ref={(element) => { triggers.current[index] = element; }} type="button" role="menuitem"
        id={`desktop-menu-trigger-${index}`} aria-label={menu.label === "" ? "Apple" : menu.label}
        aria-haspopup="menu" aria-expanded={openIndex === index} aria-controls={openIndex === index ? `desktop-menu-${index}` : undefined}
        tabIndex={focusIndex === index ? 0 : -1} className={styles.trigger}
        style={{ fontWeight: menu.label === appName ? 700 : 500, fontSize: menu.label === "" ? "15px" : "13px" }}
        onFocus={() => setFocusIndex(index)} onPointerDown={onPrepare}
        onClick={() => { if (openIndex === index && !openedByHover.current) dismiss(true); else if (openIndex !== index) open(index); openedByHover.current = false; }}
        onKeyDown={(event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          if (event.key === "Tab" && openIndex !== null) dismiss(false);
          else if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); open(index, event.key === "ArrowUp" ? "last" : "first"); }
          else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? menus.length - 1 : neighbor(index, event.key === "ArrowRight" ? 1 : -1);
            setFocusIndex(next); triggers.current[next]?.focus({ preventScroll: true }); if (openIndex !== null) open(next);
          }
        }}>{menu.label}</button>
      {openIndex === index && <div id={`desktop-menu-${index}`} role="menu" aria-labelledby={`desktop-menu-trigger-${index}`} className={styles.popup}
        onKeyDown={(event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault(); event.stopPropagation();
            const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length;
            buttons[next]?.focus({ preventScroll: true });
          } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault(); event.stopPropagation(); open(neighbor(index, event.key === "ArrowRight" ? 1 : -1));
          } else if (event.key === "Tab") dismiss(true);
          else if (event.key.length === 1 && event.key !== " ") {
            const match = [...buttons.slice(current + 1), ...buttons.slice(0, current + 1)].find((button) => button.textContent?.toLowerCase().startsWith(event.key.toLowerCase()));
            if (match) { event.preventDefault(); event.stopPropagation(); match.focus({ preventScroll: true }); }
          }
        }}>
        {menu.items.map((item) => <button key={item.label} type="button" role="menuitem" data-menu-action={item.label} disabled={item.disabled} aria-disabled={!!item.disabled} className={styles.item}
          onMouseEnter={(event) => { if (!item.disabled) event.currentTarget.focus({ preventScroll: true }); }}
          onClick={() => { if (!item.disabled) { dismiss(true); item.onSelect(); } }}>
          <span>{item.label}</span>{item.shortcut && <span className={styles.shortcut} aria-hidden="true">{item.shortcut}</span>}
        </button>)}
      </div>}
    </div>)}
  </div>;
}
