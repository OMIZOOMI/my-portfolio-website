"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { getDesktopCoordinateSpace } from "../window-manager/desktopCoordinates";
import { useDisplayStore } from "../window-manager/useDisplayStore";
import { screenQuadMatrix } from "./screenViewGeometry";
import styles from "./Laptop.module.css";
import { usePortfolioActivity } from "../portfolio/usePortfolioActivity";

export function ScreenSurface({ children, reduceMotion }: { children: ReactNode; reduceMotion: boolean }) {
  const screenView = useDisplayStore(s => s.screenView);
  const instantViewChange = useDisplayStore(s => s.instantViewChange);
  const surface = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const previousView = useRef(screenView);

  useLayoutEffect(() => {
    const element = surface.current;
    const wrapper = element?.closest<HTMLElement>(`.${styles.screenPortal}`);
    if (!element || !wrapper) return;
    const changed = previousView.current !== screenView;
    previousView.current = screenView;
    const space = getDesktopCoordinateSpace(element);
    const oldCorners = [[0, 0], [element.clientWidth, 0], [element.clientWidth, element.clientHeight], [0, element.clientHeight]]
      .map(([x, y]) => space?.toClient({ x, y }));
    animation.current?.cancel();
    animation.current = null;
    delete element.dataset.transitioning;
    wrapper.classList.toggle(styles.screenFocused, screenView);
    element.dataset.screenView = screenView ? "focused" : "laptop";
    if (!changed || reduceMotion || instantViewChange || typeof element.animate !== "function") return;
    const nextSpace = getDesktopCoordinateSpace(element);
    const localCorners = oldCorners.map(p => p ? nextSpace?.toLocal(p) : null);
    if (localCorners.some(p => !p)) return;
    const matrix = screenQuadMatrix(element.clientWidth, element.clientHeight, localCorners as { x: number; y: number }[]);
    if (!matrix) return;
    element.dataset.transitioning = "true";
    const motion = element.animate([{ transform: matrix, borderRadius: "16px" }, { transform: "none", borderRadius: screenView ? "0px" : "16px" }],
      { duration: 680, easing: "cubic-bezier(.22,.8,.2,1)" });
    animation.current = motion;
    const finish = () => { if (animation.current === motion) { animation.current = null; delete element.dataset.transitioning; } };
    motion.onfinish = finish;
    motion.oncancel = finish;
  }, [reduceMotion, screenView, instantViewChange]);

  useEffect(() => () => { animation.current?.cancel(); }, []);
  useEffect(() => {
    if (!screenView) return;
    const escape = (event: KeyboardEvent) => {
      if (!usePortfolioActivity.getState().desktopActive) return;
      const target = event.target;
      if (event.key !== "Escape" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey
        || (target instanceof HTMLElement && target.closest("input,textarea,[contenteditable=true],[role=dialog],[role=menu]"))) return;
      useDisplayStore.getState().setScreenView(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [screenView]);

  return <div ref={surface} className={styles.screenSurface} data-screen-surface>{children}</div>;
}
