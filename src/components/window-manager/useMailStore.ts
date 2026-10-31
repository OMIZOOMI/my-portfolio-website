"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  sentAt: number;
  read: boolean;
}

interface MailStoreState {
  inbox: Email[];
  sent: Email[];
  composing: boolean;
  draftSubject: string;
  draftBody: string;
  openComposer: () => void;
  closeComposer: () => void;
  clearDraft: () => void;
  setDraftSubject: (subject: string) => void;
  setDraftBody: (body: string) => void;
  handoffMessage: string | null;
  openDraftInEmailApp: () => boolean;
  markRead: (id: string) => void;
}

const seedInbox = (): Email[] => [
  {
    id: "welcome-1",
    from: "You",
    to: "Om Sawkare",
    subject: "Welcome to my portfolio!",
    body: "Hi there! Welcome to my portfolio's mail client.\n\nTo get in touch, choose Compose, then Open in your email app. You complete sending in your own email app; this portfolio cannot confirm delivery. Your draft stays here while the portfolio remains open.\n\nLooking forward to hearing from you!",
    sentAt: Date.now() - 1000 * 60 * 60 * 24,
    read: false,
  },
];

export const useMailStore = create<MailStoreState>()(
  persist(
    (set, get) => ({
      inbox: seedInbox(),
      sent: [],
      composing: false,
      draftSubject: "",
      draftBody: "",
      handoffMessage: null,
      openComposer: () => set({ composing: true }),
      closeComposer: () => set({ composing: false }),
      clearDraft: () => set({ draftSubject: "", draftBody: "", handoffMessage: null }),
      setDraftSubject: (draftSubject) => set({ draftSubject, handoffMessage: null }),
      setDraftBody: (draftBody) => set({ draftBody, handoffMessage: null }),
      openDraftInEmailApp: () => {
        const { draftSubject, draftBody } = get();
        if (!draftSubject.trim() || !draftBody.trim()) {
          set({ handoffMessage: "Add a subject and message before opening your email app." });
          return false;
        }
        try {
          globalThis.open(`mailto:sawkare.om@gmail.com?subject=${encodeURIComponent(draftSubject)}&body=${encodeURIComponent(draftBody)}`, "_self");
          set({ handoffMessage: "Requested your email app. Finish sending there. This portfolio cannot confirm delivery, and your draft is still here." });
          return true;
        } catch {
          set({ handoffMessage: "Your email app could not be opened. Your draft is still here; you can copy it and email sawkare.om@gmail.com." });
          return false;
        }
      },
      markRead: (id) =>
        set((state) => ({
          inbox: state.inbox.map((m) => (m.id === id ? { ...m, read: true } : m)),
          sent: state.sent.map((m) => (m.id === id ? { ...m, read: true } : m)),
        })),
    }),
    {
      name: "mail-store",
      storage: createJSONStorage(() => localStorage),
      // Preserve legacy Sent copies without interpreting a mailto launch as
      // delivery. The UI labels these retained copies as unverified.
      version: 4,
      migrate: (persisted) => {
        const previous = (persisted ?? {}) as Partial<MailStoreState>;
        return { inbox: previous.inbox ?? seedInbox(), sent: previous.sent ?? [] };
      },
      partialize: (state) => ({ inbox: state.inbox, sent: state.sent }),
    }
  )
);
