/** Focus the existing mounted surface after React has applied a window action. */
export function focusPortfolioWindow(id: string) {
  requestAnimationFrame(() => {
    const frame = [...document.querySelectorAll<HTMLElement>("[data-window-frame]")]
      .find(element => element.dataset.windowFrame === id);
    if (!frame || frame.dataset.windowActive !== "true" || frame.dataset.windowMinimized === "true" || frame.dataset.windowClosing === "true") return;
    if (!frame.contains(document.activeElement)) frame.focus({ preventScroll: true });
  });
}

export function revealDockControl(button: HTMLElement) {
  const dock = button.closest<HTMLElement>("[data-dock-surface]");
  if (!dock) return;
  // Scroll only the Dock, never the transformed screen's outer ancestors.
  if (button.offsetLeft < dock.scrollLeft) dock.scrollLeft = Math.max(0, button.offsetLeft - 6);
  else if (button.offsetLeft + button.offsetWidth > dock.scrollLeft + dock.clientWidth) {
    dock.scrollLeft = button.offsetLeft + button.offsetWidth - dock.clientWidth + 6;
  }
}

export function focusMinimizedWindowControl(id: string) {
  requestAnimationFrame(() => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("[data-dock-minimized-window]")]
      .find(element => element.dataset.dockMinimizedWindow === id);
    button?.focus({ preventScroll: true });
    if (button) revealDockControl(button);
  });
}
