"use client";

import { create } from "zustand";
import { PROJECTS } from "../../data/projectsData";

export const SAFARI_START_URL = "portfolio://start";

export interface SafariHistoryEntry {
  id: string;
  url: string;
  title: string;
  scrollTop: number;
  expandedDetails: string[];
}

export interface SafariTab {
  id: string;
  address: string;
  history: SafariHistoryEntry[];
  historyIndex: number;
  reloadNonce: number;
  feedback: string | null;
}

export interface SafariSession {
  tabs: SafariTab[];
  activeTabId: string;
}

interface SafariStoreState {
  normalSession: SafariSession;
  privateSession: SafariSession | null;
  bookmarksBarVisible: boolean;
  privacyMode: boolean;
  activateTab: (id: string) => void;
  newTab: (url?: string, title?: string) => string | null;
  closeTab: (id: string) => void;
  navigate: (url: string, title?: string, tabId?: string) => boolean;
  openInNewTab: (url: string, title?: string) => string | null;
  openProject: (projectId: string) => void;
  goBack: (tabId?: string) => void;
  goForward: (tabId?: string) => void;
  reload: (tabId?: string) => void;
  setAddress: (address: string, tabId?: string) => void;
  saveView: (tabId: string, entryId: string, view: { scrollTop?: number; expandedDetails?: string[] }) => void;
  setFeedback: (tabId: string, entryId: string, feedback: string) => void;
  toggleBookmarksBar: () => void;
  togglePrivacyMode: () => void;
  endPrivateSession: () => void;
}

type AddressResult = { url: string; title: string } | { error: string };

/** Only real internal routes and explicit external-link previews are navigable. */
export function resolveSafariAddress(address: string): AddressResult {
  const value = address.trim();
  if (!value) return { url: SAFARI_START_URL, title: "Start Page" };
  if (value.length > 2048 || /^[\/\\]/.test(value) || /[\s\u0000-\u001f\u007f]/.test(value)) {
    return { error: "Address not opened. Enter a valid website address or a portfolio page." };
  }
  if (/^portfolio:/i.test(value)) {
    if (value === SAFARI_START_URL || value === `${SAFARI_START_URL}#projects`) {
      return { url: value, title: value.endsWith("#projects") ? "Project Demos" : "Start Page" };
    }
    const id = /^portfolio:\/\/project\/([^/?#]+)$/.exec(value)?.[1];
    const project = PROJECTS.find((item) => item.id === id);
    return project ? { url: value, title: project.name } : { error: "Portfolio page not found. Your current page has been kept." };
  }
  const explicitHttp = /^https?:\/\//i.test(value);
  // A bare hostname may include a port; other schemes (including script/data/file) cannot be opened.
  if (!explicitHttp && /^[a-z][a-z\d+.-]*:/i.test(value) && !/^(?:localhost|[a-z\d.-]+\.[a-z\d.-]+):\d+(?:\/|$)/i.test(value)) {
    return { error: "Address not opened. Only portfolio pages and HTTP/HTTPS website links are supported." };
  }
  try {
    const url = new URL(explicitHttp ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || (!explicitHttp && !url.hostname.includes(".") && url.hostname !== "localhost")) {
      throw new Error("Unsupported address");
    }
    return { url: url.href, title: `Link: ${url.hostname}` };
  } catch {
    return { error: "Address not opened. Enter a valid website address or a portfolio page." };
  }
}

let identity = 0;
const nextId = (kind: string) => `safari-${kind}-${++identity}`;
function createEntry(url: string, title: string): SafariHistoryEntry {
  return { id: nextId("page"), url, title, scrollTop: 0, expandedDetails: [] };
}
function createTab(url = SAFARI_START_URL, title = "Start Page"): SafariTab {
  return { id: nextId("tab"), address: url, history: [createEntry(url, title)], historyIndex: 0, reloadNonce: 0, feedback: null };
}
function createSession(): SafariSession {
  const tab = createTab();
  return { tabs: [tab], activeTabId: tab.id };
}

export const selectSafariSession = (state: SafariStoreState): SafariSession =>
  state.privacyMode && state.privateSession ? state.privateSession : state.normalSession;
export const currentSafariEntry = (tab: SafariTab): SafariHistoryEntry => tab.history[tab.historyIndex];

// All sessions are memory-only. Normal tabs survive app close; private tabs are
// discarded on leaving Private or closing Safari. A real page reload resets both.
export const useSafariStore = create<SafariStoreState>((set, get) => {
  const updateSession = (update: (session: SafariSession) => SafariSession) => set((state) => {
    const session = selectSafariSession(state), next = update(session);
    if (next === session) return state;
    return state.privacyMode ? { privateSession: next } : { normalSession: next };
  });
  const updateTab = (tabId: string | undefined, update: (tab: SafariTab) => SafariTab) => updateSession((session) => {
    const id = tabId ?? session.activeTabId;
    let changed = false;
    const tabs = session.tabs.map((tab) => {
      if (tab.id !== id) return tab;
      const next = update(tab);
      changed = next !== tab;
      return next;
    });
    return changed ? { ...session, tabs } : session;
  });
  const travel = (direction: number, tabId?: string) => updateTab(tabId, (tab) => {
    const historyIndex = tab.historyIndex + direction;
    if (historyIndex < 0 || historyIndex >= tab.history.length) return tab;
    return { ...tab, historyIndex, address: tab.history[historyIndex].url, feedback: null };
  });
  return {
    normalSession: createSession(), privateSession: null, bookmarksBarVisible: true, privacyMode: false,
    activateTab: (id) => updateSession((session) =>
      session.activeTabId === id || !session.tabs.some((tab) => tab.id === id) ? session : { ...session, activeTabId: id }),
    newTab: (url = SAFARI_START_URL, title) => {
      const result = resolveSafariAddress(url);
      if ("error" in result) { updateTab(undefined, (tab) => ({ ...tab, feedback: result.error })); return null; }
      const tab = createTab(result.url, title ?? result.title);
      updateSession((session) => ({ tabs: [...session.tabs, tab], activeTabId: tab.id }));
      return tab.id;
    },
    closeTab: (id) => updateSession((session) => {
      const index = session.tabs.findIndex((tab) => tab.id === id);
      if (index < 0) return session;
      if (session.tabs.length === 1) return createSession();
      const tabs = session.tabs.filter((tab) => tab.id !== id);
      // Prefer the left neighbor, otherwise the first remaining tab.
      return { tabs, activeTabId: id === session.activeTabId ? tabs[Math.max(0, index - 1)].id : session.activeTabId };
    }),
    navigate: (address, title, tabId) => {
      const result = resolveSafariAddress(address);
      let navigated = false;
      updateTab(tabId, (tab) => {
        if ("error" in result) return { ...tab, feedback: result.error };
        navigated = true;
        if (currentSafariEntry(tab).url === result.url) return { ...tab, address: result.url, feedback: null };
        const history = [...tab.history.slice(0, tab.historyIndex + 1), createEntry(result.url, title ?? result.title)];
        return { ...tab, address: result.url, history, historyIndex: history.length - 1, feedback: null };
      });
      return navigated;
    },
    openInNewTab: (url, title) => get().newTab(url, title),
    openProject: (id) => { get().navigate(`portfolio://project/${id}`); },
    goBack: (tabId) => travel(-1, tabId),
    goForward: (tabId) => travel(1, tabId),
    reload: (tabId) => updateTab(tabId, (tab) => ({ ...tab, address: currentSafariEntry(tab).url, reloadNonce: tab.reloadNonce + 1, feedback: "Portfolio view refreshed. External websites are not loaded inside this demo." })),
    setAddress: (address, tabId) => updateTab(tabId, (tab) => tab.address === address ? tab : { ...tab, address, feedback: null }),
    saveView: (tabId, entryId, view) => set((state) => {
      // The normal page can unmount just after entering Private. Its cleanup
      // still belongs to normal history; globally unique IDs prevent cross-session writes.
      const key = state.normalSession.tabs.some((tab) => tab.id === tabId) ? "normalSession" : "privateSession";
      const session = state[key];
      if (!session) return state;
      const tab = session.tabs.find((item) => item.id === tabId);
      if (!tab) return state;
      const entry = tab.history.find((item) => item.id === entryId);
      // Cleanup can save a page after navigating away. Only its unique history
      // entry may change; a pruned entry, closed tab or ended private session
      // cannot alter the newer page or the newly active tab.
      if (!entry) return state;
      const scrollTop = view.scrollTop !== undefined && Number.isFinite(view.scrollTop) ? Math.max(0, view.scrollTop) : entry.scrollTop;
      const expandedDetails = view.expandedDetails ?? entry.expandedDetails;
      if (scrollTop === entry.scrollTop && expandedDetails.length === entry.expandedDetails.length && expandedDetails.every((id, index) => id === entry.expandedDetails[index])) return state;
      const history = tab.history.map((item) => item.id === entryId ? { ...item, scrollTop, expandedDetails: [...expandedDetails] } : item);
      return { [key]: { ...session, tabs: session.tabs.map((item) => item.id === tabId ? { ...tab, history } : item) } };
    }),
    setFeedback: (tabId, entryId, feedback) => updateTab(tabId, (tab) =>
      currentSafariEntry(tab).id === entryId ? { ...tab, feedback } : tab),
    toggleBookmarksBar: () => set((state) => ({ bookmarksBarVisible: !state.bookmarksBarVisible })),
    togglePrivacyMode: () => set((state) => state.privacyMode
      ? { privacyMode: false, privateSession: null }
      : { privacyMode: true, privateSession: createSession() }),
    endPrivateSession: () => set((state) => state.privacyMode || state.privateSession
      ? { privacyMode: false, privateSession: null } : state),
  };
});
