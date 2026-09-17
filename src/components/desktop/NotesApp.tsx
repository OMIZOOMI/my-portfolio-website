"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Folder, Search, Edit, X, Bold, Italic, Underline } from "lucide-react";
import { create } from "zustand";
import { useSmoothScroll as useMacScroll } from "./useSmoothScroll";

// --- 1. NOTES STORE (single rich-text HTML string per note + search state) ---
interface Note {
  id: string;
  contentHtml: string;
  updatedAt: number;
}

const DEFAULT_NOTE_HTML = `<h1>Developer Log // Current Status</h1><p>I am a Final Year Computer Science Engineering student at VIT Bhopal, engineering AI pipelines and edge systems designed to solve real-world problems.</p><p><strong>Tech Stack:</strong><br>✅ Python<br>✅ Java<br>✅ AWS Cloud Architecture<br>✅ React / Next.js</p><p><strong>Active Projects:</strong><br>• Real-Time Sign Language Translator<br>• Smart Assistive Stick (ESP32 &amp; Ultrasonic Sensors)<br>• Vehicle Tracking System (GPS Integration)</p><p><strong>Recent Hackathons &amp; Events:</strong><br>• Adobe University Hackathon 2026<br>• Devfolio AI x Filmmaking<br>• GrowthSchool Generative AI Mastermind</p>`;

const BLANK_NOTE_HTML = "";

interface NotesState {
  notes: Note[];
  activeNoteId: string | null;
  searchQuery: string;
  showSearch: boolean;
  addNote: () => void;
  setActiveNote: (id: string) => void;
  updateNoteContent: (id: string, html: string) => void;
  setSearchQuery: (q: string) => void;
  toggleSearch: () => void;
}

// This lives OUTSIDE the component, so it never forgets your notes!
export const useNotesStore = create<NotesState>((set) => ({
  notes: [{ id: "1", contentHtml: DEFAULT_NOTE_HTML, updatedAt: Date.now() }],
  activeNoteId: "1",
  searchQuery: "",
  showSearch: false,
  addNote: () =>
    set((state) => {
      // Blank page — no forced Title/Body split, the user formats freely.
      const newNote: Note = { id: Date.now().toString(), contentHtml: BLANK_NOTE_HTML, updatedAt: Date.now() };
      return { notes: [newNote, ...state.notes], activeNoteId: newNote.id };
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

// --- 2. SCROLL FIX (shared normalized hook; see useSmoothScroll.ts) ---

// --- 3. MAIN COMPONENT ---
export function NotesApp({ window }: { window: { id: string; title: string } }) {
  void window;
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
  } = useNotesStore();

  const sidebarRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Tracks which note's HTML is currently loaded into the uncontrolled editor
  // so keystrokes (which update the store + re-render) never clobber the caret.
  const loadedNoteIdRef = useRef<string | null>(null);

  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false, header: false });

  useMacScroll(sidebarRef);
  useMacScroll(scrollerRef);

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

  function refreshFormatState() {
    try {
      const block = document.queryCommandValue("formatBlock").toLowerCase();
      setFmt({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        header: block === "h1",
      });
    } catch {
      // queryCommandState throws for unsupported commands — leave as-is.
    }
  }

  // Load note HTML into the editor only when switching notes.
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !activeNote) return;
    if (loadedNoteIdRef.current !== activeNote.id) {
      loadedNoteIdRef.current = activeNote.id;
      el.innerHTML = activeNote.contentHtml;
      refreshFormatState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNote?.id]);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  const exec = (command: string, value?: string) => {
    const el = editorRef.current;
    if (!el || !activeNote) return;
    el.focus({ preventScroll: true });
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

  const toolBtn =
    "p-1.5 rounded-md transition-colors text-gray-500 hover:bg-gray-200 hover:text-gray-800";
  const toolBtnActive = "bg-gray-800 text-white hover:bg-gray-800 hover:text-white";

  return (
    <div className="flex w-full h-full bg-[#f4f4f4] text-gray-800 font-sans select-text overflow-hidden">
      <style>{`
        .notes-editor { outline: none; caret-color: #b8860b; }
        .notes-editor:empty::before {
          content: attr(data-placeholder);
          color: #c4c4c7;
          pointer-events: none;
        }
        .notes-editor h1 { font-size: 1.75rem; font-weight: 800; color: #111; margin: 0 0 0.75rem; line-height: 1.2; }
        .notes-editor h2 { font-size: 1.35rem; font-weight: 700; color: #111; margin: 0 0 0.6rem; }
        .notes-editor p { margin: 0 0 0.6rem; }
        .notes-editor ul, .notes-editor ol { margin: 0 0 0.6rem; padding-left: 1.4rem; }
        .notes-editor li { margin-bottom: 0.15rem; }
        .notes-editor b, .notes-editor strong { font-weight: 700; }
      `}</style>

      {/* Sidebar */}
      <div className="w-56 h-full bg-[#ebebeb] border-r border-gray-300 flex flex-col overflow-hidden shrink-0">
        <div className="h-12 flex items-center px-4 border-b border-gray-300 text-gray-500 shrink-0">
          <Folder size={16} className="mr-2 text-yellow-600" />
          <span className="font-semibold text-sm">On My Mac</span>
          {searchQuery.trim() && (
            <span className="ml-auto text-[11px] text-gray-400">
              {filteredNotes.length} hit{filteredNotes.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div
          ref={sidebarRef}
          className="flex-1 overflow-y-auto p-2 space-y-1"
          style={{ transform: "translateZ(0)" }}
        >
          {filteredNotes.map((note) => {
            const preview = notePreview(note.contentHtml);
            return (
              <div
                key={note.id}
                onClick={() => setActiveNote(note.id)}
                className={`rounded-md p-3 cursor-pointer border-l-4 transition-colors ${
                  activeNoteId === note.id
                    ? "bg-yellow-500/20 text-yellow-800 border-yellow-500"
                    : "text-gray-700 border-transparent hover:bg-gray-200/50"
                }`}
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
      <div className="flex-1 h-full flex flex-col bg-white overflow-hidden" style={{ backgroundImage: "radial-gradient(#e5e5e5 1px, transparent 1px)", backgroundSize: "20px 20px" }}>

        {/* Toolbar: formatting + search + new note */}
        <div className="min-h-12 border-b border-gray-200 flex items-center gap-1 px-3 py-1.5 bg-white/80 backdrop-blur-sm shrink-0 flex-wrap">
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

          <div className="w-px h-5 bg-gray-300 mx-1" />

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

          {showSearch && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-md px-2 py-1 mr-1">
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") toggleSearch();
                }}
                placeholder="Search notes…"
                className="bg-transparent outline-none text-sm w-32 placeholder-gray-400 text-gray-800"
                aria-label="Search notes"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-gray-400 hover:text-gray-700"
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
            className="p-1 hover:bg-gray-100 rounded-md transition-colors"
            title="Create a new note"
          >
            <Edit size={16} className="text-gray-500 hover:text-gray-800" />
          </button>
        </div>

        {/* Unified scrolling page — title scrolls away naturally with the body */}
        {activeNote ? (
          <div
            ref={scrollerRef}
            className="flex-1 overflow-y-auto"
            style={{ transform: "translateZ(0)" }}
          >
            <div className="max-w-2xl mx-auto px-10 py-10 min-h-full">
              <div
                ref={editorRef}
                contentEditable={true}
                suppressContentEditableWarning={true}
                onInput={handleInput}
                onKeyUp={refreshFormatState}
                onMouseUp={refreshFormatState}
                onPointerDown={(e) => e.stopPropagation()}
                data-placeholder="Start writing…"
                aria-label="Note editor"
                className="notes-editor w-full bg-transparent text-gray-800 text-[15px] leading-relaxed font-medium min-h-[60vh]"
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select or create a note to start writing.
          </div>
        )}
      </div>
    </div>
  );
}
