"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { PORTFOLIO_PROFILE as profile } from "../../data/portfolioProfile";
import { MAIL_WELCOME, migrateMailWelcome } from "../../data/mailWelcome";

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
    ...MAIL_WELCOME,
    sentAt: Date.now(),
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
          globalThis.open(`mailto:${profile.email}?subject=${encodeURIComponent(draftSubject)}&body=${encodeURIComponent(draftBody)}`, "_self");
          set({ handoffMessage: "Requested your email app. Finish sending there. This portfolio cannot confirm delivery; your draft is still here. If nothing opens, copy the email address and use your usual mail app or website." });
          return true;
        } catch {
          set({ handoffMessage: `Your email app could not be opened. Your draft is still here; copy ${profile.email} and use your usual mail app or website.` });
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
      version: 5,
      migrate: (persisted) => {
        const previous = (persisted ?? {}) as Partial<MailStoreState>;
        return { inbox: previous.inbox ? migrateMailWelcome(previous.inbox) : seedInbox(), sent: previous.sent ?? [] };
      },
      partialize: (state) => ({ inbox: state.inbox, sent: state.sent }),
    }
  )
);
