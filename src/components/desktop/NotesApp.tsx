"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Folder, Search, Edit, X, Bold, Italic, Underline, Trash2 } from "lucide-react";
import { create } from "zustand";
import { useSystemStore } from "../window-manager/useSystemStore";
import styles from "./NotesApp.module.css";
import { getDesktopCoordinateSpace } from "../window-manager/desktopCoordinates";

// --- 1. NOTES STORE (single rich-text HTML string per note + search state) ---
interface Note {
  id: string;
  contentHtml: string;
  updatedAt: number;
}

const DEFAULT_NOTE_HTML = `<h1>Developer Log</h1>
<p>Long before code, I built Lego robots and marvelled at Halo’s Spartan armor. That curiosity grew into a fascination with technology that extends what people can do.</p>
<p>I’m Om Sawkare, a final-year student at VIT, working across computer vision, AI workflows, and backend development.</p>
<p>My main focus is <strong data-note-highlight="true">Veyra</strong>, a website investigation tool I’m building to turn page evidence into clear, useful reports. I want people to understand what needs attention, why it matters, and what the tool could actually verify.</p>
<p>My <strong data-note-highlight="true">Adobe hackathon</strong> brand-audit project explores how websites communicate with people and AI systems. Four analyzers share a crawl to produce a report with evidence and practical recommendations. Our team reached the <mark>top 45</mark> among roughly 100,000 teams.</p>
<p>White Box Detection gave me experience with YOLOv8 and OpenCV; my TigerGraph and FastAPI work strengthened my approach to evidence, data, and backend design.</p>
<p data-note-signoff="true">Technology is only as powerful as the impact on a person's day to day</p>`;

const BLANK_NOTE_HTML = "";

interface NotesState {
  notes: Note[];
  activeNoteId: string | null;
  searchQuery: string;
  showSearch: boolean;
  addNote: () => void;
  clearActiveNote: () => void;
  deleteActiveNote: () => void;
  deleteNote: (id: string) => void;
  deletedNote: { note: Note; index: number } | null;
  undoDelete: () => void;
  setActiveNote: (id: string) => void;
  updateNoteContent: (id: string, html: string) => void;
  setSearchQuery: (q: string) => void;
  toggleSearch: () => void;
}

// Session memory only: closing/reopening Notes retains edits; reloading resets.
let noteSequence = 0;
export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [{ id: "1", contentHtml: DEFAULT_NOTE_HTML, updatedAt: Date.now() }],
  activeNoteId: "1",
  searchQuery: "",
  showSearch: false,
  deletedNote: null,
  addNote: () =>
    set((state) => {
      // Blank page — no forced Title/Body split, the user formats freely.
      const newNote: Note = { id: `note-${Date.now()}-${++noteSequence}`, contentHtml: BLANK_NOTE_HTML, updatedAt: Date.now() };
      return { notes: [newNote, ...state.notes], activeNoteId: newNote.id };
    }),
  clearActiveNote: () =>
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === state.activeNoteId ? { ...note, contentHtml: "", updatedAt: Date.now() } : note
      ),
    })),
  deleteActiveNote: () => { const id = get().activeNoteId; if (id) get().deleteNote(id); },
  deleteNote: (id) =>
    set((state) => {
      const index = state.notes.findIndex(note => note.id === id);
      if (index < 0) return state;
      const remaining = state.notes.filter(note => note.id !== id);
      return { notes: remaining, deletedNote: { note: state.notes[index], index }, activeNoteId: state.activeNoteId === id ? remaining[Math.min(index, remaining.length - 1)]?.id ?? null : state.activeNoteId };
    }),
  undoDelete: () => set(state => {
    if (!state.deletedNote) return state;
    const { note, index } = state.deletedNote;
    const notes = [...state.notes];
    if (!notes.some(item => item.id === note.id)) notes.splice(Math.min(index, notes.length), 0, note);
    return { notes, activeNoteId: note.id, deletedNote: null };
  }),
  setActiveNote: (id) => set({ activeNoteId: id }),
  updateNoteContent: (id, html) =>
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === id ? { ...n, contentHtml: html, updatedAt: Date.now() } : n
      ),
    })),
  setSearchQuery: (q) => set({ searchQuery: q }),
  toggleSearch: () => set((state) => ({ showSearch: !state.showSearch, searchQuery: "" })),
}));

// Plain-text helpers for sidebar previews + search matching.
function htmlToText(html: string): string {
  if (typeof document === "undefined") return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").replace(/\u00a0/g, " ");
}

function notePreview(html: string): { title: string; snippet: string } {
  const lines = htmlToText(html)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return {
    title: lines[0] ?? "New Note",
    snippet: lines.slice(1).join(" ") || "No additional text",
  };
}

// --- 2. MAIN COMPONENT ---
export function NotesApp({ window }: { window: { id: string; title: string } }) {
  void window;
  const reduceMotion = useSystemStore((state) => state.reduceMotion);
  const {
    notes,
    activeNoteId,
    searchQuery,
    showSearch,
    addNote,
    setActiveNote,
    updateNoteContent,
    setSearchQuery,
    toggleSearch,
    deleteNote,
    deletedNote,
    undoDelete,
  } = useNotesStore();

  const appRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [noteMenu, setNoteMenu] = useState<{ id: string; x: number; y: number; trigger: HTMLElement } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // The editor stays uncontrolled while typing; external changes such as Clear
  // still need to reach the DOM even when the active note's ID is unchanged.
  const loadedNoteIdRef = useRef<string | null>(null);

  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false, header: false });

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt),
    [notes]
  );

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedNotes;
    return sortedNotes.filter((n) => htmlToText(n.contentHtml).toLowerCase().includes(q));
  }, [sortedNotes, searchQuery]);

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null;

  const openNoteMenu = (id: string, trigger: HTMLElement, x: number, y: number) => {
    const app = appRef.current;
    if (!app) return;
    const point = getDesktopCoordinateSpace(app)?.toLocal({ x, y });
    if (!point) return;
    setNoteMenu({ id, trigger, x: Math.max(8, Math.min(point.x, app.clientWidth - 188)), y: Math.max(8, Math.min(point.y, app.clientHeight - 60)) });
  };
  useEffect(() => {
    if (!noteMenu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setNoteMenu(null); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setNoteMenu(null); noteMenu.trigger.focus({ preventScroll: true }); }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape, true); };
  }, [noteMenu]);

  function focusEditor(resetSelection = false) {
    const el = editorRef.current;
    if (!el) return null;
    el.focus({ preventScroll: true });
    const selection = document.getSelection();
    // A toolbar click on a fresh note may still refer to the old note's range.
    // Keep an existing in-editor selection, otherwise place the caret inside it.
    if (selection && (resetSelection || !el.contains(selection.anchorNode) || !el.contains(selection.focusNode))) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return el;
  }

  function refreshFormatState() {
    const el = editorRef.current;
    const selection = document.getSelection();
    if (!el || !selection || !el.contains(selection.anchorNode)) return;
    try {
      const node = selection.anchorNode;
      const element = node instanceof Element ? node : node?.parentElement;
      setFmt({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        header: !!element?.closest("h1"),
      });
    } catch {
      // queryCommandState throws for unsupported commands — leave as-is.
    }
  }

  // Apply external content before the next paint/input. A normal keystroke has
  // already updated the DOM, so equality leaves its caret and native undo alone.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el || !activeNote) return;
    if (loadedNoteIdRef.current !== activeNote.id || el.innerHTML !== activeNote.contentHtml) {
      const changedNote = loadedNoteIdRef.current !== activeNote.id;
      loadedNoteIdRef.current = activeNote.id;
      el.innerHTML = activeNote.contentHtml;
      if (changedNote && !activeNote.contentHtml) focusEditor(true);
      refreshFormatState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNote?.id, activeNote?.contentHtml]);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  const exec = (command: string, value?: string) => {
    const el = focusEditor();
    if (!el || !activeNote) return;
    try {
      document.execCommand(command, false, value);
    } catch {
      // Unsupported command — ignore.
    }
    // execCommand doesn't reliably fire input, so sync the store manually.
    updateNoteContent(activeNote.id, el.innerHTML);
    refreshFormatState();
  };

  const toggleHeader = () => {
    // Focus/restore the editor before asking for its current block format.
    if (!focusEditor()) return;
    let isHeader = false;
    try {
      isHeader = document.queryCommandValue("formatBlock").toLowerCase() === "h1";
    } catch {
      isHeader = false;
    }
    exec("formatBlock", isHeader ? "p" : "h1");
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    if (!activeNote) return;
    updateNoteContent(activeNote.id, e.currentTarget.innerHTML);
  };

  const toolBtn = styles.toolButton;
  const toolBtnActive = styles.toolButtonActive;

  return (
    <div ref={appRef} className={styles.notesApp} data-notes-app data-reduced-motion={reduceMotion || undefined}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <Folder size={16} />
          <span className="font-semibold text-sm">On My Mac</span>
          {searchQuery.trim() && (
            <span className="ml-auto text-[11px] text-gray-400">
              {filteredNotes.length} hit{filteredNotes.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div
          className={styles.noteList}
          style={{ transform: "translateZ(0)" }}
        >
          {filteredNotes.map((note) => {
            const preview = notePreview(note.contentHtml);
            return (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                aria-label={preview.title}
                aria-current={activeNoteId === note.id ? "true" : undefined}
                onClick={() => setActiveNote(note.id)}
                onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openNoteMenu(note.id, event.currentTarget, event.clientX, event.clientY); }}
                onKeyDown={(event) => {
                  if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
                    event.preventDefault(); event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
                    openNoteMenu(note.id, event.currentTarget, rect.left + 20, rect.bottom); return;
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveNote(note.id);
                  }
                }}
                className={`${styles.noteRow} ${activeNoteId === note.id ? styles.selected : ""}`}
              >
                <h4 className="font-bold text-sm truncate">{preview.title}</h4>
                <p className="text-xs mt-1 opacity-70 truncate">{preview.snippet}</p>
              </div>
            );
          })}
          {filteredNotes.length === 0 && (
            <div className="p-4 text-xs text-gray-400 text-center">
              No notes match “{searchQuery.trim()}”.
            </div>
          )}
        </div>
      </div>

      {/* Main Content View */}
      <div className={styles.main}>

        {/* Toolbar: formatting + search + new note */}
        <div className={styles.toolbar}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("bold")}
            className={`${toolBtn} ${fmt.bold ? toolBtnActive : ""}`}
            title="Bold"
            aria-label="Bold"
            aria-pressed={fmt.bold}
          >
            <Bold size={16} />
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("italic")}
            className={`${toolBtn} ${fmt.italic ? toolBtnActive : ""}`}
            title="Italic"
            aria-label="Italic"
            aria-pressed={fmt.italic}
          >
            <Italic size={16} />
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("underline")}
            className={`${toolBtn} ${fmt.underline ? toolBtnActive : ""}`}
            title="Underline"
            aria-label="Underline"
            aria-pressed={fmt.underline}
          >
            <Underline size={16} />
          </button>

          <div className="w-px h-5 bg-gray-300 dark:bg-white/15 mx-1" />

          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleHeader}
            className={`${toolBtn} px-2 font-black text-sm leading-none ${fmt.header ? toolBtnActive : ""}`}
            title="Heading"
            aria-label="Toggle heading"
            aria-pressed={fmt.header}
          >
            H
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("formatBlock", "p")}
            className={`${toolBtn} px-2 text-sm leading-none font-medium ${!fmt.header ? toolBtnActive : ""}`}
            title="Normal text"
            aria-label="Normal text"
          >
            Body
          </button>

          <div className="flex-1" />
          <button type="button" className={toolBtn} disabled={!activeNote} aria-label="Delete current note" title="Delete note" onClick={() => { if (activeNote) deleteNote(activeNote.id); }}><Trash2 size={16} /></button>

          {showSearch && (
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 rounded-md px-2 py-1 mr-1">
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") toggleSearch();
                }}
                placeholder="Search notes…"
                className="bg-transparent outline-none text-sm w-32 placeholder-gray-400 dark:placeholder-gray-500 text-gray-800 dark:text-gray-200"
                aria-label="Search notes"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}
          <button
            onClick={toggleSearch}
            className={`${toolBtn} ${showSearch ? toolBtnActive : ""}`}
            title="Search notes"
            aria-label="Search notes"
            aria-pressed={showSearch}
          >
            <Search size={16} />
          </button>
          <button
            onClick={addNote}
            className={toolBtn}
            title="Create a new note"
          >
            <Edit size={16} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100" />
          </button>
        </div>

        {/* Unified scrolling page — title scrolls away naturally with the body */}
        {activeNote ? (
          <div
            className={styles.scroller}
            style={{ transform: "translateZ(0)" }}
          >
            <div className={styles.notePage} data-note-page>
              <time className={styles.editedAt} dateTime={new Date(activeNote.updatedAt).toISOString()} aria-label="Last edited">
                {new Date(activeNote.updatedAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}
              </time>
              <div
                ref={editorRef}
                contentEditable={true}
                suppressContentEditableWarning={true}
                onInput={handleInput}
                onFocus={refreshFormatState}
                onKeyUp={refreshFormatState}
                onMouseUp={refreshFormatState}
                onPointerDown={(e) => e.stopPropagation()}
                data-placeholder="Start writing…"
                aria-label="Note editor"
                className={`${styles.editor} notes-editor`}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select or create a note to start writing.
          </div>
        )}
      </div>
      {noteMenu && <div ref={menuRef} role="menu" aria-label="Note actions" className={styles.noteMenu} style={{ left: noteMenu.x, top: noteMenu.y }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }} onKeyDown={event => { if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); } if (event.key === "Tab") setNoteMenu(null); }}>
        <button type="button" role="menuitem" onClick={() => { deleteNote(noteMenu.id); setNoteMenu(null); requestAnimationFrame(() => editorRef.current?.focus({ preventScroll: true })); }}><Trash2 size={14} />Delete note</button>
      </div>}
      {deletedNote && <div className={styles.deleteNotice} role="status">Note deleted <button type="button" onClick={undoDelete}>Undo delete</button></div>}
    </div>
  );
}
