"use client";

import React, { useState } from "react";
import { Send, Inbox, MailPlus } from "lucide-react";
import { useMailStore, type Email } from "../window-manager/useMailStore";

const MY_EMAIL = "sawkare.om@gmail.com";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function emailPreview(body: string): string {
  const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  return line ?? "No content";
}

// FIX: Renamed the prop to 'win' so it doesn't shadow the browser's 'window'
export function MailApp({ window: win }: { window: { id: string; title: string } }) {
  void win; // kept for WindowManager prop parity; compose is window-agnostic
  const { inbox, sent, sendEmail, markRead } = useMailStore();
  const [mailbox, setMailbox] = useState<"inbox" | "sent">("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(inbox[0]?.id ?? null);
  const [composing, setComposing] = useState(false);

  // --- compose state (text-only; mailto: carries no binaries) ---
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const list = mailbox === "inbox" ? inbox : sent;
  const selected: Email | null = list.find((m) => m.id === selectedId) ?? null;
  const unreadInbox = inbox.filter((m) => !m.read).length;

  const selectEmail = (id: string) => {
    setSelectedId(id);
    setComposing(false);
    markRead(id);
  };

  const switchMailbox = (box: "inbox" | "sent") => {
    setMailbox(box);
    setComposing(false);
    const first = (box === "inbox" ? inbox : sent)[0];
    setSelectedId(first?.id ?? null);
    if (first) markRead(first.id);
  };

  const handleSend = () => {
    if (!subject || !message) return;
    // Text-only handoff to the visitor's native mail client.
    window.location.href = `mailto:${MY_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    // Record a copy in Sent, then close compose and clear its state.
    const id = sendEmail({ to: "Om Sawkare", subject, body: message });
    setSubject("");
    setMessage("");
    setMailbox("sent");
    setSelectedId(id);
    setComposing(false);
  };

  return (
    <div className="w-full h-full flex bg-[#f5f5f5] text-gray-800 font-sans overflow-hidden">
      {/* Mailbox sidebar + message list */}
      <div className="w-60 h-full bg-[#ebebeb] border-r border-gray-300 flex flex-col overflow-hidden shrink-0">
        <div className="p-3 shrink-0">
          <button
            onClick={() => setComposing(true)}
            className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-3 py-2 transition-colors"
          >
            <MailPlus size={16} /> Compose
          </button>
        </div>
        <div className="px-3 pb-2 flex gap-1 shrink-0">
          <button
            onClick={() => switchMailbox("inbox")}
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm rounded-md px-2 py-1.5 transition-colors ${
              mailbox === "inbox" && !composing
                ? "bg-gray-300 font-semibold"
                : "hover:bg-gray-300/50 text-gray-600"
            }`}
          >
            <Inbox size={14} /> Inbox
            {unreadInbox > 0 && (
              <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
                {unreadInbox}
              </span>
            )}
          </button>
          <button
            onClick={() => switchMailbox("sent")}
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm rounded-md px-2 py-1.5 transition-colors ${
              mailbox === "sent" && !composing
                ? "bg-gray-300 font-semibold"
                : "hover:bg-gray-300/50 text-gray-600"
            }`}
          >
            <Send size={14} /> Sent
            {sent.length > 0 && (
              <span className="bg-gray-500 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
                {sent.length}
              </span>
            )}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {list.map((mail) => (
            <div
              key={mail.id}
              onClick={() => selectEmail(mail.id)}
              className={`rounded-md p-2.5 cursor-pointer border-l-4 transition-colors ${
                selectedId === mail.id && !composing
                  ? "bg-blue-500/15 border-blue-500"
                  : "border-transparent hover:bg-gray-300/50"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {!mail.read && <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
                <h4 className="font-bold text-[13px] truncate flex-1">
                  {mailbox === "inbox" ? mail.from : `To: ${mail.to}`}
                </h4>
              </div>
              <p className="text-xs font-medium truncate mt-0.5">{mail.subject}</p>
              <p className="text-[11px] text-gray-500 truncate">{emailPreview(mail.body)}</p>
            </div>
          ))}
          {list.length === 0 && (
            <p className="text-xs text-gray-400 text-center p-4">
              {mailbox === "inbox" ? "Inbox zero. Enjoy it." : "Nothing sent yet."}
            </p>
          )}
        </div>
      </div>

      {/* Right pane: reader or compose */}
      {composing ? (
        <div className="flex-1 h-full flex flex-col bg-white overflow-hidden">
          <div className="h-12 bg-[#e8e8e8] border-b border-gray-300 flex items-center justify-between px-4 shrink-0">
            <button
              onClick={handleSend}
              className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-sm font-medium disabled:opacity-50"
              disabled={!subject || !message}
            >
              <Send size={16} /> Send
            </button>
          </div>

          <div className="flex flex-col border-b border-gray-200 bg-white shrink-0">
            <div className="flex px-4 py-2 border-b border-gray-100 items-center">
              <span className="text-gray-400 w-16 text-sm">To:</span>
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md text-sm font-medium">Om Sawkare</span>
            </div>
            <div className="flex px-4 py-2 items-center border-b border-gray-100">
              <span className="text-gray-400 w-16 text-sm">Subject:</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="flex-1 outline-none text-sm bg-transparent"
                placeholder="Opportunity / Networking"
              />
            </div>
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 w-full p-4 outline-none resize-none bg-white text-sm"
            placeholder="Type your message here..."
          />
        </div>
      ) : selected ? (
        <div className="flex-1 h-full flex flex-col bg-white overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-gray-200 shrink-0">
            <h2 className="text-lg font-bold text-gray-900 leading-snug">{selected.subject}</h2>
            <p className="text-xs text-gray-500 mt-1">
              From: <span className="font-medium text-gray-700">{selected.from}</span>
              {"  "}· To: <span className="font-medium text-gray-700">{selected.to}</span>
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">{formatDate(selected.sentAt)}</p>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
              {selected.body}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm bg-white">
          Select a message to read it.
        </div>
      )}
    </div>
  );
}
