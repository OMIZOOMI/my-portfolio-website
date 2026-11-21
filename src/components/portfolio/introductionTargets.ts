import type { IntroductionStep } from "./useIntroductionStore";

export interface IntroductionTarget { x: number; y: number; width: number; height: number }
/** These are already viewport rectangles from the transformed DOM. No local
 * desktop point is treated as a client point, and no synthetic clicks occur. */
export function measureIntroductionTarget(step: IntroductionStep, expectedScreenView?: boolean) {
  const surface = document.querySelector<HTMLElement>("[data-screen-surface]");
  const transitioning = !!document.querySelector("[data-screen-surface][data-transitioning]")
    || (expectedScreenView !== undefined && !!surface && surface.dataset.screenView !== (expectedScreenView ? "focused" : "laptop"));
  const desktop = document.getElementById("desktop-root");
  const terminalIntro = step === "terminal" ? document.querySelector<HTMLElement>("[data-terminal-introduction]") : null;
  const terminalFrame = terminalIntro?.closest<HTMLElement>("[data-window-frame]");
  const transcriptRect = terminalIntro?.closest<HTMLElement>("[data-terminal-transcript]")?.getBoundingClientRect();
  const selector = step === "screen" || step === "laptop" ? "[data-workspace-trigger]"
    : step === "terminal" ? '[data-dock-app="terminal"]'
    : step === "contact" ? (document.querySelector<HTMLElement>("[data-professional-profiles]") ? "[data-professional-profiles]" : '[data-dock-app="safari"]')
    : step === "projects" ? '#desktop-root [data-file-icon="projects"]' : null;
  const element = (step === "projects" ? document.querySelector<HTMLElement>('[data-window-active="true"] [data-finder-content="projects"]') : null)
    ?? terminalIntro ?? (selector ? document.querySelector<HTMLElement>(selector) : null);
  const rect = element?.getBoundingClientRect();
  const hidden = element?.closest('[inert],[aria-hidden="true"],[data-window-minimized="true"],[data-window-closing="true"]');
  const visible = !transitioning && !hidden && (!terminalFrame || terminalFrame.dataset.windowActive === "true") && rect && rect.width > 1 && rect.height > 1
    && rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
  const terminalViewport = transcriptRect ? {
    x: Math.max(4, transcriptRect.left), y: Math.max(4, transcriptRect.top),
    width: Math.min(window.innerWidth - 4, transcriptRect.right) - Math.max(4, transcriptRect.left),
    height: Math.min(window.innerHeight - 4, transcriptRect.bottom) - Math.max(4, transcriptRect.top),
  } : null;
  let target: IntroductionTarget | null = null;
  if (visible) {
    const left = Math.max(4, rect.left, terminalViewport?.x ?? 0), top = Math.max(4, rect.top, terminalViewport?.y ?? 0);
    const right = Math.min(rect.right, terminalViewport ? terminalViewport.x + terminalViewport.width : window.innerWidth - 4);
    const bottom = Math.min(rect.bottom, terminalViewport ? terminalViewport.y + terminalViewport.height : window.innerHeight - 4);
    target = { x: left, y: top, width: right - left, height: bottom - top };
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
  return { desktopReady: !!desktop && !transitioning, target: target && target.width > 1 && target.height > 1 ? target : null, terminalViewport };
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
