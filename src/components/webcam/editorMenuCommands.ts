export interface EditorMenuTarget {
  element: HTMLElement;
  windowId: string | null;
  range: Range | null;
  start: number | null;
  end: number | null;
  direction: "forward" | "backward" | "none" | null;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
}

export function captureEditorMenuTarget(target: EventTarget | null): EditorMenuTarget | null {
  if (!(target instanceof HTMLElement)) return null;
  const element = target.closest<HTMLElement>('input, textarea, [contenteditable="true"]');
  if (!element) return null;
  const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element : null;
  if (field && (field.disabled || field.readOnly || (field instanceof HTMLInputElement && !["text", "search", "url", "tel", "email", "password"].includes(field.type)))) return null;
  const selection = document.getSelection();
  const range = !field && selection?.rangeCount && element.contains(selection.anchorNode) && element.contains(selection.focusNode) ? selection.getRangeAt(0).cloneRange() : null;
  const enabled = (command: string) => { try { return document.queryCommandEnabled(command); } catch { return false; } };
  return {
    element, windowId: element.closest<HTMLElement>('[data-window-frame]')?.dataset.windowFrame ?? null,
    range, start: field?.selectionStart ?? null, end: field?.selectionEnd ?? null, direction: field?.selectionDirection ?? null,
    canUndo: enabled("undo"), canRedo: enabled("redo"),
    hasSelection: field ? field.selectionStart !== field.selectionEnd : !!range && !range.collapsed,
  };
}

export function restoreEditorMenuTarget(target: EditorMenuTarget | null, activeWindowId: string | null): boolean {
  if (!target?.element.isConnected || target.windowId !== activeWindowId || target.element.closest('[inert]')) return false;
  const { element, range, start, end, direction } = target;
  element.focus({ preventScroll: true });
  if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && start !== null && end !== null) {
    element.setSelectionRange(start, end, direction ?? "none");
  } else if (range && element.contains(range.commonAncestorContainer)) {
    const selection = document.getSelection();
    selection?.removeAllRanges(); selection?.addRange(range);
  }
  return true;
}

/** Only file surfaces own filesystem Undo shortcuts; ordinary editors keep native undo. */
export function fileHistoryShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "defaultPrevented" | "isComposing">, editing: boolean, appKind: string): "undo" | "redo" | null {
  if (editing || event.defaultPrevented || event.isComposing || event.altKey || !["finder", "bin"].includes(appKind)) return null;
  const key = event.key.toLowerCase();
  if (!(event.metaKey || event.ctrlKey) || (key !== "z" && !(event.ctrlKey && key === "y"))) return null;
  return event.shiftKey || key === "y" ? "redo" : "undo";
}
