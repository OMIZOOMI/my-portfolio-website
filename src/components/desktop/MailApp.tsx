"use client";

import React, { useEffect, useRef, useState } from "react";
import { Send, Paperclip, X, FileText, Inbox, MailPlus, Download } from "lucide-react";
import { useMailStore, type Email } from "../window-manager/useMailStore";

const ACCEPT = "image/*,video/*,.pdf,.doc,.docx,.txt";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Module-level object-URL cache (keyed per compose window + file identity).
// Compose-time previews only — sent mail uses persisted base64 data URLs.
// Render reads via plain functions (no refs during render); add/remove and
// unmount own all create/revoke calls, so no URL ever leaks.
const objectUrlCache = new Map<string, string>();

function cachedObjectUrl(key: string, file: File): string {
  let url = objectUrlCache.get(key);
  if (!url) {
    url = URL.createObjectURL(file);
    objectUrlCache.set(key, url);
  }
  return url;
}

function revokeObjectUrl(key: string) {
  const url = objectUrlCache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrlCache.delete(key);
  }
}

function revokeWindowUrls(winId: string) {
  const prefix = `${winId}::`;
  for (const key of Array.from(objectUrlCache.keys())) {
    if (key.startsWith(prefix)) revokeObjectUrl(key);
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function emailPreview(body: string): string {
  const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  return line ?? "No content";
}

// FIX: Renamed the prop to 'win' so it doesn't shadow the browser's 'window'
export function MailApp({ window: win }: { window: { id: string; title: string } }) {
  const { inbox, sent, sendEmail, markRead } = useMailStore();
  const [mailbox, setMailbox] = useState<"inbox" | "sent">("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(inbox[0]?.id ?? null);
  const [composing, setComposing] = useState(false);

  // --- compose state ---
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileKey = (f: File): string =>
    `${win.id}::${f.name}::${f.size}::${f.lastModified}`;

  // Revoke this window's outstanding object URLs when compose unmounts.
  useEffect(() => {
    const id = win.id;
    return () => revokeWindowUrls(id);
  }, [win.id]);

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

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (picked.length === 0) return;
    setAttachments((prev) => {
      const seen = new Set(prev.map(fileKey));
      const fresh = picked.filter((f) => {
        const key = fileKey(f);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [...prev, ...fresh];
    });
  };

  const removeAttachment = (file: File) => {
    const key = fileKey(file);
    revokeObjectUrl(key);
    setAttachments((prev) => prev.filter((f) => fileKey(f) !== key));
  };

  const handleSend = async () => {
    if (isSending || !subject || !message) return;
    setIsSending(true);
    try {
      // Persist real file DATA as base64 — never a flattened filename string.
      const stored = await Promise.all(
        attachments.map(async (f) => ({
          name: f.name,
          type: f.type,
          size: f.size,
          data: await fileToDataUrl(f),
        }))
      );
      const id = sendEmail({
        to: "Om Sawkare",
        subject,
        body: message,
        attachments: stored,
      });
      // Compose previews are obsolete now that bytes live in the store.
      attachments.forEach((f) => revokeObjectUrl(fileKey(f)));
      setAttachments([]);
      setSubject("");
      setMessage("");
      setMailbox("sent");
      setSelectedId(id);
      setComposing(false);
    } catch (err) {
      console.error("Send failed while reading attachments:", err);
    } finally {
      setIsSending(false);
    }
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
                {mail.attachments.length > 0 && (
                  <Paperclip size={12} className="text-gray-400 shrink-0" />
                )}
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
              disabled={!subject || !message || isSending}
            >
              <Send size={16} /> {isSending ? "Sending…" : "Send"}
            </button>
            <div className="flex items-center gap-2">
              {attachments.length > 0 && (
                <span className="text-xs text-gray-500">{attachments.length} attached</span>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Attach files"
                aria-label="Attach files"
                className="p-1 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-300/50 transition-colors"
              >
                <Paperclip size={18} />
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            onChange={handleFilesSelected}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />

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

          {attachments.length > 0 && (
            <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap gap-2 max-h-32 overflow-y-auto shrink-0">
              {attachments.map((file) => {
                const key = fileKey(file);
                const isImage = file.type.startsWith("image/");
                const isVideo = file.type.startsWith("video/");
                return (
                  <div
                    key={key}
                    className="relative flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-lg p-1.5 pr-2 max-w-56"
                  >
                    {isImage ? (
                      <img
                        src={cachedObjectUrl(key, file)}
                        alt={file.name}
                        draggable={false}
                        className="w-10 h-10 rounded-md object-cover shrink-0 pointer-events-none"
                      />
                    ) : isVideo ? (
                      <video
                        src={cachedObjectUrl(key, file)}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-10 h-10 rounded-md object-cover shrink-0 pointer-events-none bg-black"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-white border border-gray-200 flex items-center justify-center shrink-0">
                        <FileText size={18} className="text-gray-500" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-[11px] text-gray-500">{formatSize(file.size)}</p>
                    </div>
                    <button
                      onClick={() => removeAttachment(file)}
                      title={`Remove ${file.name}`}
                      aria-label={`Remove ${file.name}`}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-500 text-white flex items-center justify-center hover:bg-gray-700 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

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
            {selected.attachments.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-200 flex flex-col gap-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {selected.attachments.length} Attachment{selected.attachments.length === 1 ? "" : "s"}
                </p>
                {selected.attachments.map((att, i) =>
                  att.type.startsWith("image/") ? (
                    <img
                      key={`${att.name}-${i}`}
                      src={att.data}
                      alt={att.name}
                      draggable={false}
                      className="max-w-full rounded-lg shadow-sm border border-gray-200"
                      title={`${att.name} (${formatSize(att.size)})`}
                    />
                  ) : att.type.startsWith("video/") ? (
                    <video
                      key={`${att.name}-${i}`}
                      src={att.data}
                      controls
                      playsInline
                      preload="metadata"
                      className="max-w-full rounded-lg shadow-sm border border-gray-200"
                      title={`${att.name} (${formatSize(att.size)})`}
                    />
                  ) : (
                    <a
                      key={`${att.name}-${i}`}
                      href={att.data}
                      download={att.name}
                      className="flex items-center gap-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg px-3 py-2.5 transition-colors max-w-72"
                      title={`Download ${att.name}`}
                    >
                      <div className="w-9 h-9 rounded-md bg-white border border-gray-200 flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-gray-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{att.name}</p>
                        <p className="text-[11px] text-gray-500">{formatSize(att.size)}</p>
                      </div>
                      <Download size={14} className="text-gray-400 shrink-0" />
                    </a>
                  )
                )}
              </div>
            )}
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
