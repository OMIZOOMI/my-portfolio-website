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
    from: "You",
    to: "Om Sawkare",
    subject: "Welcome to my portfolio!",
    body: "Hi there! Welcome to my portfolio's mail client.\n\nIf you'd like to get in touch, simply hit 'Compose' and drop me a message. Clicking send will open your device's native email app so you can reach me directly.\n\nLooking forward to hearing from you!",
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
      // Bumped past the attachment-era payloads so stale seeds/sent mail
      // from earlier builds are discarded on rehydrate.
      version: 2,
      partialize: (state) => ({ inbox: state.inbox, sent: state.sent }),
    }
  )
);
