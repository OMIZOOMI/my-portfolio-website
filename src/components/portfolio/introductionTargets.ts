import type { IntroductionStep } from "./useIntroductionStore";

export interface IntroductionTarget { x: number; y: number; width: number; height: number }

function clipToViewport(rect: DOMRect, viewport?: IntroductionTarget | null): IntroductionTarget {
  const x = Math.max(rect.left, viewport?.x ?? 4);
  const y = Math.max(rect.top, viewport?.y ?? 4);
  const right = Math.min(rect.right, viewport ? viewport.x + viewport.width : window.innerWidth - 4);
  const bottom = Math.min(rect.bottom, viewport ? viewport.y + viewport.height : window.innerHeight - 4);
  return { x, y, width: right - x, height: bottom - y };
}

/** These are already viewport rectangles from the transformed DOM. No local
 * desktop point is treated as a client point, and no synthetic clicks occur. */
export function measureIntroductionTarget(step: IntroductionStep, expectedScreenView?: boolean) {
  const surface = document.querySelector<HTMLElement>("[data-screen-surface]");
  const transitioning = !!document.querySelector("[data-screen-surface][data-transitioning]")
    || (expectedScreenView !== undefined && !!surface && surface.dataset.screenView !== (expectedScreenView ? "focused" : "laptop"));
  const desktop = document.getElementById("desktop-root");
  const terminalIntro = step === "terminal" ? document.querySelector<HTMLElement>("[data-terminal-introduction]") : null;
  const browserFrame = step === "contact" ? document.querySelector<HTMLElement>('[data-window-frame="app-safari"]') : null;
  const browserPage = browserFrame?.querySelector<HTMLElement>("[data-safari-page]:not([hidden])");
  const profiles = browserPage?.querySelector<HTMLElement>("[data-professional-profiles]");
  const frame = terminalIntro?.closest<HTMLElement>("[data-window-frame]") ?? browserFrame;
  const scrollport = terminalIntro?.closest<HTMLElement>("[data-terminal-transcript]") ?? browserPage;
  const viewport = scrollport ? clipToViewport(scrollport.getBoundingClientRect()) : null;
  const selector = step === "screen" || step === "laptop" ? "[data-workspace-trigger]"
    : step === "terminal" ? '[data-dock-app="terminal"]'
    : step === "contact" && !browserFrame ? '[data-dock-app="safari"]'
    : step === "projects" ? '#desktop-root [data-file-icon="projects"]' : null;
  const element = (step === "projects" ? document.querySelector<HTMLElement>('[data-window-active="true"] [data-finder-content="projects"]') : null)
    ?? terminalIntro ?? profiles ?? (selector ? document.querySelector<HTMLElement>(selector) : null);
  const rect = element?.getBoundingClientRect();
  const hidden = element?.closest('[hidden],[inert],[aria-hidden="true"],[data-window-minimized="true"],[data-window-closing="true"]');
  const visible = !transitioning && !hidden && (!frame || frame.dataset.windowActive === "true") && rect;
  let target: IntroductionTarget | null = null;
  if (visible) {
    target = clipToViewport(rect, viewport);
    const { x: left, y: top } = target;
    const right = left + target.width, bottom = top + target.height;
    const panel = document.querySelector<HTMLElement>('[data-introduction-viewport] [data-introduction-panel]')?.getBoundingClientRect();
    if (panel && left < panel.right && right > panel.left && top < panel.bottom && bottom > panel.top) {
      const exposed = [
        { x: left, y: top, width: panel.left - left, height: bottom - top },
        { x: panel.right, y: top, width: right - panel.right, height: bottom - top },
        { x: left, y: top, width: right - left, height: panel.top - top },
        { x: left, y: panel.bottom, width: right - left, height: bottom - panel.bottom },
      ].filter(part => part.width >= 24 && part.height >= 24).sort((a, b) => b.width * b.height - a.width * a.height);
      target = exposed[0] ?? null;
    }
  }
  return { desktopReady: !!desktop && !transitioning, target: target && target.width > 1 && target.height > 1 ? target : null, viewport };
}

export function observeIntroductionTarget(step: IntroductionStep, notify: (measurement: ReturnType<typeof measureIntroductionTarget>) => void, expectedScreenView?: boolean) {
  let disposed = false;
  const measure = () => { if (!disposed) notify(measureIntroductionTarget(step, expectedScreenView)); };
  measure();
  const timer = window.setInterval(measure, 120);
  window.addEventListener("resize", measure);
  window.addEventListener("scroll", measure, true);
  return () => { disposed = true; window.clearInterval(timer); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
}
