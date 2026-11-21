/** Reveal keyboard focus inside the menu only, without scrolling its projected host. */
export function focusMenuItem(button: HTMLButtonElement | undefined | null) {
  if (!button) return;
  button.focus({ preventScroll: true });
  const menu = button.closest<HTMLElement>('[role="menu"]');
  if (!menu) return;
  // The decorative glass now lives on the outer menu. Scroll only its item
  // list so both the backing and the transformed desktop stay stationary.
  const parent = button.parentElement;
  const scroller = parent && parent !== menu && parent.scrollHeight > parent.clientHeight ? parent : menu;
  const top = button.offsetTop - (scroller === menu ? 0 : scroller.offsetTop);
  if (top < scroller.scrollTop) scroller.scrollTop = top;
  else if (top + button.offsetHeight > scroller.scrollTop + scroller.clientHeight) {
    scroller.scrollTop = top + button.offsetHeight - scroller.clientHeight;
  }
}
