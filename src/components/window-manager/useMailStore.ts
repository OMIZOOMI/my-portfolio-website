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

export interface SendDraft {
  to: string;
  subject: string;
  body: string;
}

interface MailStoreState {
  inbox: Email[];
  sent: Email[];
  sendEmail: (draft: SendDraft) => string;
  markRead: (id: string) => void;
}

const seedInbox = (): Email[] => [
  {
    id: "welcome-1",
    from: "Om Sawkare",
    to: "Me",
    subject: "Welcome to your inbox",
    body: "This is your portfolio mail client.\n\nHit Compose to open your native email client with a pre-filled message.",
    sentAt: Date.now() - 1000 * 60 * 60 * 24,
    read: false,
  },
];

export const useMailStore = create<MailStoreState>()(
  persist(
    (set) => ({
      inbox: seedInbox(),
      sent: [],
      sendEmail: (draft) => {
        const email: Email = {
          id: Date.now().toString(),
          from: "Me",
          ...draft,
          sentAt: Date.now(),
          read: true,
        };
        set((state) => ({ sent: [email, ...state.sent] }));
        return email.id;
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
      // NOTE: very large base64 attachments can exceed the ~5MB localStorage
      // quota; zustand then keeps state in memory for the session (the write
      // fails, the app does not). Images stay fully functional either way.
      partialize: (state) => ({ inbox: state.inbox, sent: state.sent }),
    }
  )
);
