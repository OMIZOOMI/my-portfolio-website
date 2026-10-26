"use client";

import { ArrowUpRight, Code2, ExternalLink, GitBranch, Layers3 } from "lucide-react";
import { getProjectById } from "../../data/projectsData";
import { useSafariStore } from "./useSafariStore";
import { useWindowStore } from "../window-manager/useWindowStore";

interface ProjectDetailViewProps {
  window: { id: string; title: string };
  context?: unknown;
}

const GAME_DETAILS: Record<string, { summary: string; details: string[] }> = {
  "Block Rush": {
    summary: "A small arcade concept surfaced through the portfolio’s hidden game menu.",
    details: ["Procedural block-based interaction", "Gesture-friendly UI experiments", "A compact showcase of playful interface work"],
  },
  "Kingdom Siege": {
    summary: "A strategy-game concept used to demonstrate the portfolio’s hidden arcade path.",
    details: ["Resource and territory planning", "Layered visual feedback", "A focused interaction experiment"],
  },
};

export function ProjectDetailView({ window: win }: ProjectDetailViewProps) {
  const projectId = win.id.replace(/^file-/, "");
  const project = getProjectById(projectId);
  const game = GAME_DETAILS[win.title.replace(/\.app$/, "")];

  const openInSafari = () => {
    useWindowStore.getState().openWindow({ id: "app-safari", kind: "safari", title: "Safari" });
    if (project) useSafariStore.getState().openProject(project.id);
  };

  const openRepository = () => {
    if (project) globalThis.open(project.repositoryUrl, "_blank", "noopener,noreferrer");
  };

  const title = project?.name ?? win.title;
  const summary = project?.summary ?? game?.summary ?? "A portfolio file with a focused interaction and architecture note.";
  const details = project?.highlights ?? game?.details ?? ["Interactive portfolio artifact", "Built as part of the macOS desktop experience"];

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-[#f6f6f7] text-gray-900 dark:bg-[#17171b] dark:text-gray-100 transition-colors duration-700">
      <div className="border-b border-gray-200 bg-white/80 px-7 py-6 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
          <Code2 size={14} /> Project file
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openInSafari}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--system-accent)] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Open in Safari <ArrowUpRight size={14} />
            </button>
            {project && (
              <button
                type="button"
                onClick={openRepository}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-gray-400 dark:border-white/15 dark:bg-white/5 dark:text-gray-200 dark:hover:border-white/30"
              >
                GitHub <ExternalLink size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 px-7 py-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Layers3 size={16} className="text-[var(--system-accent)]" /> Architecture
          </div>
          {project ? (
            <p className="mb-4 text-sm leading-6 text-gray-600 dark:text-gray-300">{project.description}</p>
          ) : null}
          <ol className="space-y-3">
            {(project?.architecture ?? details).map((detail, index) => (
              <li key={detail} className="flex gap-3 text-sm leading-6 text-gray-700 dark:text-gray-200">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--system-accent)]/15 text-xs font-bold text-[var(--system-accent)]">
                  {index + 1}
                </span>
                <span>{detail}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <GitBranch size={16} className="text-[var(--system-accent)]" /> Technology stack
            </div>
            <div className="flex flex-wrap gap-2">
              {(project?.stack ?? ["React", "TypeScript", "Interactive UI"]).map((technology) => (
                <span key={technology} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-200">
                  {technology}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ExternalLink size={16} className="text-[var(--system-accent)]" /> Highlights
            </div>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
              {details.map((detail) => (
                <li key={detail} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--system-accent)]" />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
