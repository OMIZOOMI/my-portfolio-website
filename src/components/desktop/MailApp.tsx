"use client";

import React, { useState } from "react";
import { Send, Paperclip } from "lucide-react";

// FIX: Renamed the prop to 'win' so it doesn't shadow the browser's 'window'
export function MailApp({ window: win }: { window: any }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const handleSend = () => {
    const myEmail = "sawkare.om@gmail.com"; 
    // This will now correctly trigger the browser's mail client
    window.location.href = `mailto:${myEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
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
        <Paperclip size={18} className="text-gray-500" />
      </div>

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