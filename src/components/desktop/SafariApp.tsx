"use client";

import { FormEvent } from "react";
import {
  BookOpen,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GitBranch,
  Globe2,
  LockKeyhole,
  Plus,
  RotateCw,
  Shield,
  X,
} from "lucide-react";
import { PROJECTS, getProjectById, type ProjectData } from "../../data/projectsData";
import { SAFARI_START_URL, useSafariStore } from "./useSafariStore";

interface SafariWindowProps {
  window: { id: string; title: string };
}

function normalizeAddress(address: string): string {
  const value = address.trim();
  if (!value) return SAFARI_START_URL;
  if (value.startsWith("portfolio://") || /^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function openExternal(url: string) {
  globalThis.open(url, "_blank", "noopener,noreferrer");
}

function ProjectCard({ project, onOpen }: { project: ProjectData; onOpen: () => void }) {
  return (
    <article className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Featured repository</p>
          <h2 className="text-lg font-bold leading-tight text-gray-900 dark:text-white">{project.name}</h2>
        </div>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: project.accent }} aria-hidden="true" />
      </div>
      <p className="mb-4 text-sm leading-6 text-gray-600 dark:text-gray-300">{project.summary}</p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {project.stack.map((technology) => (
          <span key={technology} className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 dark:bg-white/10 dark:text-gray-200">
            {technology}
          </span>
        ))}
      </div>
      <details className="mb-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
        <summary className="cursor-pointer font-semibold text-gray-700 dark:text-gray-200">Architecture breakdown</summary>
        <ul className="mt-3 space-y-2">
          {project.architecture.map((layer) => (
            <li key={layer} className="flex gap-2 leading-5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: project.accent }} />
              <span>{layer}</span>
            </li>
          ))}
        </ul>
      </details>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110"
          style={{ backgroundColor: project.accent }}
        >
          View details <ChevronRight size={14} />
        </button>
        <button
          type="button"
          onClick={() => openExternal(project.repositoryUrl)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-gray-400 dark:border-white/15 dark:text-gray-200 dark:hover:border-white/30"
        >
          Open repo <ExternalLink size={14} />
        </button>
      </div>
    </article>
  );
}

function StartPage({ onNavigate }: { onNavigate: (url: string, title?: string) => void }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--system-accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--system-accent)]">
            <Globe2 size={14} /> Portfolio Start Page
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Build systems. Ship useful work.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Explore the engineering projects behind this desktop experience, from edge inference to cloud-native APIs.
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-right shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Favorites</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{PROJECTS.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">core repositories</p>
        </div>
      </div>

      <section id="projects" aria-labelledby="project-favorites-heading">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen size={16} className="text-[var(--system-accent)]" />
          <h2 id="project-favorites-heading" className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Project favorites</h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {PROJECTS.map((project) => (
            <ProjectCard key={project.id} project={project} onOpen={() => onNavigate(`portfolio://project/${project.id}`, project.name)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ProjectPage({ project, onNavigate }: { project: ProjectData; onNavigate: (url: string, title?: string) => void }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-8">
      <button type="button" onClick={() => onNavigate(SAFARI_START_URL, "Start Page")} className="mb-6 inline-flex items-center gap-1 text-xs font-semibold text-[var(--system-accent)] hover:underline">
        <ChevronLeft size={14} /> Back to favorites
      </button>
      <div className="mb-7 rounded-3xl border border-gray-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="mb-4 flex items-start justify-between gap-5">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Project detail</p>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{project.name}</h1>
          </div>
          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: project.accent }} aria-hidden="true" />
        </div>
        <p className="max-w-3xl text-sm leading-7 text-gray-600 dark:text-gray-300">{project.description}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {project.stack.map((technology) => (
            <span key={technology} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-200">{technology}</span>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => openExternal(project.repositoryUrl)} className="inline-flex items-center gap-2 rounded-lg bg-[var(--system-accent)] px-4 py-2.5 text-xs font-semibold text-white hover:brightness-110">
            <GitBranch size={15} /> Open GitHub repository <ExternalLink size={14} />
          </button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Architecture</h2>
          <ol className="space-y-4">
            {project.architecture.map((layer, index) => (
              <li key={layer} className="flex gap-3 text-sm leading-6 text-gray-700 dark:text-gray-200">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--system-accent)]/15 text-xs font-bold text-[var(--system-accent)]">{index + 1}</span>
                <span>{layer}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Highlights</h2>
          <ul className="space-y-3">
            {project.highlights.map((highlight) => (
              <li key={highlight} className="flex gap-2 text-sm leading-6 text-gray-700 dark:text-gray-200">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: project.accent }} />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function ExternalPage({ url }: { url: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-gray-100 via-white to-gray-200 px-8 text-center dark:from-[#111117] dark:via-[#17171b] dark:to-[#202027]">
      <div className="max-w-lg rounded-3xl border border-gray-200 bg-white/90 p-8 shadow-xl dark:border-white/10 dark:bg-white/[0.06]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900 text-white dark:bg-white dark:text-gray-900"><Globe2 size={28} /></div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">External website</h1>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">This portfolio browser keeps external pages in a safe handoff card. Open the destination in a new browser tab when you are ready.</p>
        <p className="mt-4 break-all rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300">{url}</p>
        <button type="button" onClick={() => openExternal(url)} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--system-accent)] px-4 py-2.5 text-xs font-semibold text-white hover:brightness-110">
          Open externally <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
}

export function SafariApp({ window: win }: SafariWindowProps) {
  const tabs = useSafariStore((state) => state.tabs);
  const activeTabId = useSafariStore((state) => state.activeTabId);
  const bookmarksBarVisible = useSafariStore((state) => state.bookmarksBarVisible);
  const privacyMode = useSafariStore((state) => state.privacyMode);
  const reloadNonce = useSafariStore((state) => state.reloadNonce);
  const newTab = useSafariStore((state) => state.newTab);
  const closeTab = useSafariStore((state) => state.closeTab);
  const navigate = useSafariStore((state) => state.navigate);
  const goBack = useSafariStore((state) => state.goBack);
  const goForward = useSafariStore((state) => state.goForward);
  const reload = useSafariStore((state) => state.reload);
  const setAddress = useSafariStore((state) => state.setAddress);
  const toggleBookmarksBar = useSafariStore((state) => state.toggleBookmarksBar);
  const togglePrivacyMode = useSafariStore((state) => state.togglePrivacyMode);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  if (!activeTab) return null;

  const handleAddressSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = normalizeAddress(activeTab.address);
    const title = url.startsWith("portfolio://") ? "Portfolio" : "External Page";
    navigate(url, title);
  };

  const isStartPage = activeTab.url.startsWith(SAFARI_START_URL);
  const projectId = activeTab.url.startsWith("portfolio://project/") ? activeTab.url.replace("portfolio://project/", "") : null;
  const project = projectId ? getProjectById(projectId) : null;
  const isExternal = /^https?:\/\//i.test(activeTab.url);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#f3f3f5] text-gray-900 dark:bg-[#1a1a1e] dark:text-gray-100 font-sans" aria-label={win.title}>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-gray-300 bg-[#e7e7e9] px-2 dark:border-white/10 dark:bg-[#242428]">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => navigate(tab.url, tab.title)}
            className={`group flex h-7 max-w-56 min-w-32 items-center gap-2 rounded-md px-3 text-xs transition ${tab.id === activeTab.id ? "bg-white font-semibold shadow-sm dark:bg-white/10" : "text-gray-500 hover:bg-white/60 dark:text-gray-400 dark:hover:bg-white/5"}`}
          >
            <span className="truncate">{tab.title}</span>
            <span
              role="button"
              tabIndex={0}
              aria-label={`Close ${tab.title}`}
              onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); closeTab(tab.id); } }}
              className="ml-auto rounded p-0.5 opacity-60 hover:bg-gray-200 hover:opacity-100 dark:hover:bg-white/10"
            >
              <X size={12} />
            </span>
          </button>
        ))}
        <button type="button" onClick={() => newTab()} aria-label="New Safari tab" className="rounded-md p-1.5 text-gray-500 hover:bg-white/70 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"><Plus size={15} /></button>
      </div>

      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-gray-300 bg-[#dedee1] px-3 dark:border-white/10 dark:bg-[#2a2a2e]">
        <div className="flex items-center gap-1">
          <button type="button" onClick={goBack} disabled={activeTab.historyIndex <= 0} aria-label="Back" className="rounded-md p-1.5 text-gray-600 hover:bg-white/60 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-white/10"><ChevronLeft size={18} /></button>
          <button type="button" onClick={goForward} disabled={activeTab.historyIndex >= activeTab.history.length - 1} aria-label="Forward" className="rounded-md p-1.5 text-gray-600 hover:bg-white/60 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-white/10"><ChevronRight size={18} /></button>
        </div>
        <button type="button" onClick={reload} aria-label="Reload page" className="rounded-md p-1.5 text-gray-600 hover:bg-white/60 dark:text-gray-300 dark:hover:bg-white/10"><RotateCw size={15} /></button>
        <button type="button" onClick={togglePrivacyMode} aria-label="Toggle privacy mode" aria-pressed={privacyMode} className={`rounded-md p-1.5 ${privacyMode ? "text-[var(--system-accent)]" : "text-gray-600 dark:text-gray-300"} hover:bg-white/60 dark:hover:bg-white/10`}><Shield size={15} /></button>
        <form onSubmit={handleAddressSubmit} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 shadow-inner dark:border-white/10 dark:bg-[#1c1c20]">
          {privacyMode ? <LockKeyhole size={14} className="shrink-0 text-[var(--system-accent)]" /> : <Globe2 size={14} className="shrink-0 text-gray-400" />}
          <input value={activeTab.address} onChange={(event) => setAddress(event.target.value)} aria-label="Safari address bar" className="min-w-0 flex-1 bg-transparent text-center text-xs text-gray-700 outline-none dark:text-gray-200" />
        </form>
        <button type="button" onClick={() => newTab()} aria-label="Open new tab" className="rounded-md p-1.5 text-gray-600 hover:bg-white/60 dark:text-gray-300 dark:hover:bg-white/10"><Plus size={17} /></button>
      </div>

      {bookmarksBarVisible && (
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-gray-300 bg-[#ebebed] px-3 dark:border-white/10 dark:bg-[#202024]">
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Bookmarks</span>
          <button type="button" onClick={() => openExternal("https://github.com/OMIZOOMI")} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-600 hover:bg-white/80 dark:text-gray-300 dark:hover:bg-white/10"><GitBranch size={12} /> GitHub</button>
          <button type="button" onClick={() => openExternal("https://www.linkedin.com/in/om-sawkare")} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-600 hover:bg-white/80 dark:text-gray-300 dark:hover:bg-white/10"><Briefcase size={12} /> LinkedIn</button>
          <button type="button" onClick={() => navigate(`${SAFARI_START_URL}#projects`, "Project Demos")} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-600 hover:bg-white/80 dark:text-gray-300 dark:hover:bg-white/10"><BookOpen size={12} /> Project Demos</button>
          <button type="button" onClick={toggleBookmarksBar} className="ml-auto text-[10px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Hide</button>
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto" key={`${activeTab.id}-${activeTab.url}-${reloadNonce}`}>
        {isStartPage && <StartPage onNavigate={navigate} />}
        {project && <ProjectPage project={project} onNavigate={navigate} />}
        {!project && !isStartPage && isExternal && <ExternalPage url={activeTab.url} />}
        {!project && !isStartPage && !isExternal && <StartPage onNavigate={navigate} />}
      </main>
    </div>
  );
}
