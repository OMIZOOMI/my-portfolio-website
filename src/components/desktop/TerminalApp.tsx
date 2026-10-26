"use client";

import React, { useRef, useState } from "react";

export function TerminalApp({ window: win }: { window: { id: string; title: string } }) {
  void win;
  const [history, setHistory] = useState<{ id: number; text: React.ReactNode }[]>([
    { id: 0, text: <div className="text-gray-400">Welcome to macOS Terminal. Try typing &apos;help&apos;, &apos;whoami&apos;, &apos;ls&apos;, or &apos;projects&apos;.</div> }
  ]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the hidden input when clicking anywhere in the terminal
  const focusInput = () => inputRef.current?.focus();

  const handleCommand = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const cmd = input.trim().toLowerCase();
      let output: React.ReactNode = "";

       if (cmd === "help") {
         output = <div className="mt-1 text-cyan-300">Commands: help, whoami, pwd, ls, projects, clear</div>;
       } else if (cmd === "ls") {
        output = (
          <div className="flex gap-4 text-blue-400 font-semibold mt-1">
            <span>Projects</span>
            <span>Documents</span>
            <span>Desktop</span>
          </div>
        );
      } else if (cmd === "whoami") {
        output = <div className="mt-1 text-green-400">Om Sawkare - Computer Science Engineering Student</div>;
      } else if (cmd === "pwd") {
        output = <div className="mt-1 text-green-400">/Users/om/PortfolioOS</div>;
      } else if (cmd === "projects") {
        output = (
          <div className="mt-1 space-y-1 text-violet-300">
            <div>edge-ai-hardware-state-detection</div>
            <div>cloud-native-asset-management-api</div>
            <div>3d-macos-web-portfolio</div>
          </div>
        );
      } else if (cmd === "clear") {
        setHistory([]);
        setInput("");
        return;
      } else if (cmd !== "") {
         output = <div className="mt-1 text-red-400">Command not found: {cmd}. Try &apos;help&apos; for available commands.</div>;
      }

      setHistory((prev) => [
        ...prev,
        { id: Date.now(), text: <div><span className="text-green-500">guest@macbook</span> <span className="text-fuchsia-500">~ %</span> {input}</div> },
        ...(output ? [{ id: Date.now() + 1, text: output }] : [])
      ]);
      setInput("");
    }
  };

  return (
    <div 
      className="w-full h-full bg-[#1e1e1e]/95 backdrop-blur-md text-gray-200 font-mono text-[13px] p-2 overflow-y-auto"
      onClick={focusInput}
    >
      <div className="p-2 flex flex-col gap-1">
        {history.map((line) => (
          <div key={line.id} className="whitespace-pre-wrap">{line.text}</div>
        ))}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-green-500">guest@macbook</span> 
          <span className="text-fuchsia-500">~ %</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleCommand}
            className="flex-1 bg-transparent outline-none border-none text-gray-200 caret-gray-200"
            autoFocus
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
