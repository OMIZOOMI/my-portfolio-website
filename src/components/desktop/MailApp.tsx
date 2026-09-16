"use client";

import React, { useEffect, useRef, useState } from "react";
import { Send, Paperclip, X, FileText } from "lucide-react";

const ACCEPT = "image/*,video/*,.pdf,.doc,.docx,.txt";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Module-level object-URL cache (keyed per compose window + file identity).
// Render reads via plain functions — no refs during render — while add/remove
// and unmount own all create/revoke calls, so no URL ever leaks.
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

// FIX: Renamed the prop to 'win' so it doesn't shadow the browser's 'window'
export function MailApp({ window: win }: { window: { id: string; title: string } }) {
  void win;
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileKey = (f: File): string =>
    `${win.id}::${f.name}::${f.size}::${f.lastModified}`;

  // Revoke this window's outstanding object URLs when compose unmounts.
  useEffect(() => {
    const id = win.id;
    return () => revokeWindowUrls(id);
  }, [win.id]);

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

  const handleSend = () => {
    const myEmail = "sawkare.om@gmail.com";
    // mailto: can't carry binary attachments — list them in the body so
    // nothing the user attached is silently dropped.
    const attachmentNote =
      attachments.length > 0
        ? `\n\n[Attachments: ${attachments.map((f) => `${f.name} (${formatSize(f.size)})`).join(", ")}]`
        : "";
    // This will now correctly trigger the browser's mail client
    window.location.href = `mailto:${myEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message + attachmentNote)}`;
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#f5f5f5] text-gray-800 font-sans">
      {/* Toolbar */}
      <div className="h-12 bg-[#e8e8e8] border-b border-gray-300 flex items-center justify-between px-4">
        <button
          onClick={handleSend}
          className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-sm font-medium disabled:opacity-50"
          disabled={!subject || !message}
        >
          <Send size={16} /> Send
        </button>
        <div className="flex items-center gap-2">
          {attachments.length > 0 && (
            <span className="text-xs text-gray-500">
              {attachments.length} attached
            </span>
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

      {/* Hidden picker — wired to the paperclip button above */}
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

      {/* Form Fields */}
      <div className="flex flex-col border-b border-gray-200 bg-white">
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

      {/* Attachment previews (macOS style, below the subject line) */}
      {attachments.length > 0 && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap gap-2 max-h-32 overflow-y-auto">
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

      {/* Message Body */}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="flex-1 w-full p-4 outline-none resize-none bg-white text-sm"
        placeholder="Type your message here..."
      />
    </div>
  );
}
