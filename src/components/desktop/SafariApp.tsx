"use client";

import { useEffect, useLayoutEffect, useRef, useId, type FormEvent } from "react";
import Image from "next/image";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GitBranch,
  Globe2,
  Plus,
  RotateCw,
  Shield,
  X,
} from "lucide-react";
import { ProjectScope } from "./ProjectScope";
import { ProjectCaseStudy } from "./ProjectCaseStudy";
import { ProjectPreview } from "./ProjectPreview";
import { PROJECTS, getProjectById, type ProjectData } from "../../data/projectsData";
import { SAFARI_START_URL, currentSafariEntry, selectSafariSession, useSafariStore, type SafariHistoryEntry } from "./useSafariStore";
import { ProfessionalProfiles } from "../portfolio/ProfessionalProfiles";
import { useIntroductionStore } from "../portfolio/useIntroductionStore";
import styles from "./SafariApp.module.css";
import { GlassButton, GlassSurface } from "../ui/PortfolioGlass";
import { useSystemStore } from "../window-manager/useSystemStore";
import { ProjectPublicLink } from "../portfolio/ProjectPublicLink";

interface SafariWindowProps {
  window: { id: string; title: string };
}

// A null return is normal with noopener in some browsers; it is not proof of
// success or blocking. Report the request, never claim the website was loaded.
function requestExternal(url: string, report: (message: string) => void) {
  try {
    globalThis.open(url, "_blank", "noopener,noreferrer");
    report("Requested a new browser tab. If nothing opened, allow pop-ups for this site. This demo has not loaded the website.");
  } catch {
    report("Could not request a browser tab. You can copy the link and open it in your browser.");
  }
}
type ExternalAction = (url: string) => void;

function ProjectCard({ project, onOpen, onExternal }: { project: ProjectData; onOpen: () => void; onExternal: ExternalAction }) {
  return (
    <article className={styles.projectCard} data-featured={project.featured || undefined}>
      <h3>
        <button type="button" className={styles.projectTitle} onClick={onOpen}>
          <span className={styles.projectMark} style={{ backgroundColor: project.accent }} aria-hidden="true" />
          <span>{project.name}</span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </h3>
      <div className={styles.projectIntro}>
        <p className={styles.projectSummary}>{project.summary}</p>
        {project.preview && <Image src={project.preview.src} width={72} height={42} alt="" unoptimized className={styles.previewThumb} />}
      </div>
      <details data-detail-key={project.id} className={styles.projectDetails}>
        <summary>Quick facts<span className="sr-only"> about {project.name}</span></summary>
        <div className={styles.projectFacts}>
          <p><strong>{project.status}</strong> · {project.stack.join(", ")}</p>
          <ul>{project.architecture.map((layer) => <li key={layer}>{layer}</li>)}</ul>
          <div className={styles.projectActions}>
            {project.publicSlug && <ProjectPublicLink projectId={project.id} />}
            <button type="button" onClick={() => onExternal(project.repositoryUrl)}>
              Open repo <ExternalLink size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      </details>
    </article>
  );
}

function StartPage({ onNavigate, onExternal }: { onNavigate: (url: string, title?: string) => void; onExternal: ExternalAction }) {
  const headingId = useId();
  return (
    <div className={`${styles.startPage} mx-auto w-full max-w-5xl`}>
      <header className={styles.startHeader}><h1>Connect with Om</h1></header>
      <ProfessionalProfiles />
      <section data-safari-projects aria-labelledby={headingId}>
        <div className={styles.projectHeading}>
          <BookOpen size={16} className={styles.projectHeadingIcon} aria-hidden="true" />
          <h2 id={headingId}>Projects</h2>
          <span>{PROJECTS.length} projects</span>
        </div>
        <div className={styles.projectGrid}>
          {PROJECTS.map((project) => (
            <ProjectCard key={project.id} project={project} onExternal={onExternal} onOpen={() => onNavigate(`portfolio://project/${project.id}`, project.name)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ProjectPage({ project, onNavigate, onExternal }: { project: ProjectData; onNavigate: (url: string, title?: string) => void; onExternal: ExternalAction }) {
  if (project.caseStudy) return <ProjectCaseStudy project={project} onExternal={onExternal} onBack={() => onNavigate(SAFARI_START_URL, "Start Page")} />;
  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-8">
      <button type="button" onClick={() => onNavigate(SAFARI_START_URL, "Start Page")} className="mb-6 inline-flex items-center gap-1 text-xs font-semibold text-[var(--system-accent)] hover:underline">
        <ChevronLeft size={14} /> Back to Start Page
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
        <ProjectScope project={project} />
        <div className="mt-5 flex flex-wrap gap-2">
          {project.stack.map((technology) => (
            <span key={technology} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-200">{technology}</span>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => onExternal(project.repositoryUrl)} className="inline-flex items-center gap-2 rounded-lg bg-[var(--system-accent)] px-4 py-2.5 text-xs font-semibold text-white hover:brightness-110">
            <GitBranch size={15} /> Open GitHub repository <ExternalLink size={14} />
          </button>
        </div>
      </div>

      {project.preview && <div className="mb-6"><ProjectPreview preview={project.preview} /></div>}
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
            {project.capabilities.map((highlight) => (
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

function ExternalPage({ url, onExternal }: { url: string; onExternal: ExternalAction }) {
  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-gray-100 via-white to-gray-200 px-8 text-center dark:from-[#111117] dark:via-[#17171b] dark:to-[#202027]">
      <div className="max-w-lg rounded-3xl border border-gray-200 bg-white/90 p-8 shadow-xl dark:border-white/10 dark:bg-white/[0.06]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900 text-white dark:bg-white dark:text-gray-900"><Globe2 size={28} /></div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">External link preview</h1>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">This website has not been loaded. This portfolio demo shows a link preview; open the destination in your real browser when you are ready.</p>
        <p className="mt-4 break-all rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300">{url}</p>
        <button type="button" onClick={() => onExternal(url)} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--system-accent)] px-4 py-2.5 text-xs font-semibold text-white hover:brightness-110">
          Open externally <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
}

function SafariPageView({ tabId, entry, reloadNonce, active }: { tabId: string; entry: SafariHistoryEntry; reloadNonce: number; active: boolean }) {
  const mainRef = useRef<HTMLElement>(null);
  const lastScroll = useRef(entry.scrollTop);
  const pageId = entry.id;
  useLayoutEffect(() => {
    if (!active || !mainRef.current) return;
    const element = mainRef.current;
    const tab = selectSafariSession(useSafariStore.getState()).tabs.find((item) => item.id === tabId);
    const saved = tab && currentSafariEntry(tab);
    if (!saved || saved.id !== pageId) return;
    element.querySelectorAll<HTMLDetailsElement>("details[data-detail-key]").forEach((details) => {
      details.open = saved.expandedDetails.includes(details.dataset.detailKey!);
    });
    element.scrollTop = saved.scrollTop;
    if (!saved.scrollTop && saved.url === `${SAFARI_START_URL}#projects`) {
      const section = element.querySelector<HTMLElement>("[data-safari-projects]");
      if (section) element.scrollTop = section.offsetTop;
    }
    lastScroll.current = element.scrollTop;
    const saveDetails = () => {
      const expandedDetails = [...element.querySelectorAll<HTMLDetailsElement>('details[data-detail-key][open]')].map((details) => details.dataset.detailKey!);
      useSafariStore.getState().saveView(tabId, pageId, { expandedDetails });
    };
    element.addEventListener("toggle", saveDetails, true);
    return () => {
      element.removeEventListener("toggle", saveDetails, true);
      useSafariStore.getState().saveView(tabId, pageId, { scrollTop: lastScroll.current });
    };
  }, [active, tabId, pageId, reloadNonce]);

  const onNavigate = (url: string, title?: string) => useSafariStore.getState().navigate(url, title, tabId);
  const onExternal = (url: string) => requestExternal(url, (message) => useSafariStore.getState().setFeedback(tabId, pageId, message));
  const projectId = entry.url.startsWith("portfolio://project/") ? entry.url.slice("portfolio://project/".length) : null;
  const project = projectId ? getProjectById(projectId) : null;
  return (
    <main ref={mainRef} id={`safari-panel-${tabId}`} role="tabpanel" aria-labelledby={`safari-label-${tabId}`} hidden={!active}
      data-safari-page={tabId} data-safari-entry={pageId} data-safari-url={entry.url} data-safari-reload={reloadNonce}
      className="relative min-h-0 flex-1 overflow-y-auto"
      onScroll={(event) => { if (active) lastScroll.current = event.currentTarget.scrollTop; }}
    >
      {entry.url.startsWith(SAFARI_START_URL) ? <StartPage onNavigate={onNavigate} onExternal={onExternal} />
        : project ? <ProjectPage project={project} onNavigate={onNavigate} onExternal={onExternal} />
        : <ExternalPage url={entry.url} onExternal={onExternal} />}
    </main>
  );
}

export function SafariApp({ window: win }: SafariWindowProps) {
  const reduceMotion = useSystemStore((state) => state.reduceMotion);
  const introducingProfiles = useIntroductionStore(state => state.phase === "active" && state.step === "contact");
  const session = useSafariStore(selectSafariSession);
  const { tabs, activeTabId } = session;
  const bookmarksBarVisible = useSafariStore((state) => state.bookmarksBarVisible);
  const privacyMode = useSafariStore((state) => state.privacyMode);
  const activeTab = tabs.find((tab) => tab.id === activeTabId)!;
  const activeEntry = currentSafariEntry(activeTab);
  const actions = useSafariStore.getState();
  const tabListRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const list = tabListRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-safari-tab="${activeTabId}"]`);
    if (!list || !item) return;
    const left = item.offsetLeft, right = left + item.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
  }, [activeTabId, activeEntry.title]);
  // Safari is single-instance. Minimize preserves both sessions; actual close
  // discards Private while normal tabs remain in memory for reopening.
  useEffect(() => () => useSafariStore.getState().endPrivateSession(), []);

  const handleAddressSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    actions.navigate(activeTab.address, undefined, activeTab.id);
  };

  return (
    <div className={`${styles.app} flex h-full w-full flex-col overflow-hidden bg-[#f3f3f5] text-gray-900 dark:bg-[#1a1a1e] dark:text-gray-100 font-sans`} aria-label={win.title}
      data-safari-mode={privacyMode ? "private" : "normal"} data-reduced-motion={reduceMotion || undefined}
      data-introduction-contact-active={introducingProfiles || undefined}>
      <div className={`${styles.tabStrip} flex h-9 shrink-0 items-center gap-2 border-b border-gray-300 bg-[#e7e7e9] px-2 dark:border-white/10 dark:bg-[#242428]`}>
        <div ref={tabListRef} role="tablist" aria-label={privacyMode ? "Private demo tabs" : "Browser tabs"} className="relative flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const entry = currentSafariEntry(tab);
            return (
              <div key={tab.id} data-safari-tab={tab.id} data-active={tab.id === activeTabId || undefined} className={`${styles.tab} flex h-7 max-w-56 min-w-32 shrink-0 items-center text-xs ${tab.id === activeTabId ? "font-semibold" : "text-gray-600 dark:text-gray-400"}`}>
                {tab.id === activeTabId && <GlassSurface />}
                <button type="button" role="tab" id={`safari-label-${tab.id}`} aria-selected={tab.id === activeTabId} tabIndex={tab.id === activeTabId ? 0 : -1} aria-controls={`safari-panel-${tab.id}`} data-safari-activate={tab.id}
                  onClick={() => actions.activateTab(tab.id)}
                  onKeyDown={(event) => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const index = tabs.findIndex((item) => item.id === tab.id);
                    const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
                    actions.activateTab(next.id);
                    document.getElementById(`safari-label-${next.id}`)?.focus();
                  }}
                  className="h-full min-w-0 flex-1 truncate px-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--system-accent)]">{entry.title}</button>
                <button type="button" aria-label={`Close ${entry.title}`} data-safari-close={tab.id} onClick={() => actions.closeTab(tab.id)}
                  className="mr-1 p-1 opacity-60 hover:bg-gray-200 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--system-accent)] dark:hover:bg-white/10"><X size={12} /></button>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => actions.newTab()} aria-label="New Browser tab" className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-white/70 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"><Plus size={15} /></button>
      </div>

      <div className={`${styles.toolbar} flex h-12 shrink-0 items-center gap-3 border-b border-gray-300 bg-[#dedee1] px-3 dark:border-white/10 dark:bg-[#2a2a2e]`}>
        <div className="flex items-center gap-1">
          <GlassButton type="button" onClick={() => actions.goBack(activeTab.id)} disabled={activeTab.historyIndex <= 0} aria-label="Back" className="rounded-md p-1.5 text-gray-600 hover:bg-white/60 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-white/10"><ChevronLeft size={18} /></GlassButton>
          <GlassButton type="button" onClick={() => actions.goForward(activeTab.id)} disabled={activeTab.historyIndex >= activeTab.history.length - 1} aria-label="Forward" className="rounded-md p-1.5 text-gray-600 hover:bg-white/60 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-white/10"><ChevronRight size={18} /></GlassButton>
        </div>
        <GlassButton type="button" onClick={() => actions.reload(activeTab.id)} aria-label="Reload page" className="rounded-md p-1.5 text-gray-600 hover:bg-white/60 dark:text-gray-300 dark:hover:bg-white/10"><RotateCw size={15} /></GlassButton>
        <GlassButton type="button" onClick={actions.togglePrivacyMode} aria-label="Private demo tabs" aria-pressed={privacyMode} title="Separate temporary tabs in this demo; no network anonymity or browser privacy." className={`rounded-md p-1.5 ${privacyMode ? "text-[var(--system-accent)]" : "text-gray-600 dark:text-gray-300"} hover:bg-white/60 dark:hover:bg-white/10`}><Shield size={15} /></GlassButton>
        <form onSubmit={handleAddressSubmit} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 shadow-inner dark:border-white/10 dark:bg-[#1c1c20]">
          {privacyMode ? <Shield size={14} className="shrink-0 text-[var(--system-accent)]" /> : <Globe2 size={14} className="shrink-0 text-gray-400" />}
          <input value={activeTab.address} onChange={(event) => actions.setAddress(event.target.value, activeTab.id)} aria-label="Browser address bar" className="min-w-0 flex-1 bg-transparent text-center text-xs text-gray-700 outline-none dark:text-gray-200" />
        </form>
        <GlassButton type="button" onClick={() => actions.newTab()} aria-label="Open new tab" className="rounded-md p-1.5 text-gray-600 hover:bg-white/60 dark:text-gray-300 dark:hover:bg-white/10"><Plus size={17} /></GlassButton>
      </div>

      {bookmarksBarVisible && (
        <div className={`${styles.bookmarks} flex h-8 shrink-0 items-center gap-1 border-b border-gray-300 bg-[#ebebed] px-3 dark:border-white/10 dark:bg-[#202024]`}>
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Bookmarks</span>
          <GlassButton type="button" onClick={() => actions.navigate(SAFARI_START_URL, "Start Page", activeTab.id)} className={styles.profileBookmark}><Globe2 size={12} aria-hidden="true" />Profiles</GlassButton>
          <GlassButton type="button" onClick={() => actions.navigate(`${SAFARI_START_URL}#projects`, "Project Demos", activeTab.id)} className={styles.projectBookmark}><BookOpen size={12} aria-hidden="true" /> Project Demos</GlassButton>
          <GlassButton type="button" onClick={actions.toggleBookmarksBar} className="ml-auto text-[10px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Hide</GlassButton>
        </div>
      )}
      {privacyMode && <p className="shrink-0 border-b border-gray-300 bg-gray-100 px-3 py-2 text-[11px] leading-4 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">Private demo tabs are cleared when you leave Private or close Browser. No network anonymity or browser-level privacy; external sites open in your normal browser.</p>}
      {activeTab.feedback && <p role="status" className="shrink-0 border-b border-gray-300 px-3 py-2 text-xs leading-4 text-gray-600 dark:border-white/10 dark:text-gray-300">{activeTab.feedback}</p>}
      {tabs.map((tab) => {
        const entry = currentSafariEntry(tab);
        return <SafariPageView key={`${tab.id}-${entry.id}-${tab.reloadNonce}`} tabId={tab.id} entry={entry} reloadNonce={tab.reloadNonce} active={tab.id === activeTabId} />;
      })}
    </div>
  );
}
