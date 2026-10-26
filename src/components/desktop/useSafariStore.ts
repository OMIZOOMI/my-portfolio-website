"use client";

import { create } from "zustand";

export const SAFARI_START_URL = "portfolio://start";

export interface SafariTab {
  id: string;
  title: string;
  url: string;
  address: string;
  history: string[];
  historyIndex: number;
}

interface SafariStoreState {
  tabs: SafariTab[];
  activeTabId: string;
  bookmarksBarVisible: boolean;
  privacyMode: boolean;
  reloadNonce: number;
  newTab: (url?: string, title?: string) => void;
  closeTab: (id: string) => void;
  navigate: (url: string, title?: string) => void;
  openInNewTab: (url: string, title?: string) => void;
  openProject: (projectId: string) => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  setAddress: (address: string) => void;
  toggleBookmarksBar: () => void;
  togglePrivacyMode: () => void;
}

let tabCounter = 0;

function createTab(url = SAFARI_START_URL, title = "Start Page"): SafariTab {
  tabCounter += 1;
  return {
    id: `safari-tab-${tabCounter}`,
    title,
    url,
    address: url,
    history: [url],
    historyIndex: 0,
  };
}

function withCurrentTab(
  tabs: SafariTab[],
  activeTabId: string,
  update: (tab: SafariTab) => SafariTab
): SafariTab[] {
  return tabs.map((tab) => (tab.id === activeTabId ? update(tab) : tab));
}

export const useSafariStore = create<SafariStoreState>((set, get) => ({
  tabs: [createTab()],
  activeTabId: "safari-tab-1",
  bookmarksBarVisible: true,
  privacyMode: false,
  reloadNonce: 0,

  newTab: (url = SAFARI_START_URL, title = "Start Page") => {
    const tab = createTab(url, title);
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }));
  },

  closeTab: (id) => {
    const state = get();
    if (state.tabs.length === 1) {
      const reset = createTab();
      set({ tabs: [reset], activeTabId: reset.id });
      return;
    }

    const closingIndex = state.tabs.findIndex((tab) => tab.id === id);
    const tabs = state.tabs.filter((tab) => tab.id !== id);
    if (id !== state.activeTabId) {
      set({ tabs });
      return;
    }

    const nextTab = tabs[Math.max(0, closingIndex - 1)] ?? tabs[0];
    set({ tabs, activeTabId: nextTab.id });
  },

  navigate: (url, title) => {
    const state = get();
    const current = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (!current) return;

    const nextTitle = title ?? current.title;
    const nextHistory = current.history.slice(0, current.historyIndex + 1);
    if (nextHistory[nextHistory.length - 1] !== url) nextHistory.push(url);

    set({
      tabs: withCurrentTab(state.tabs, state.activeTabId, (tab) => ({
        ...tab,
        title: nextTitle,
        url,
        address: url,
        history: nextHistory,
        historyIndex: nextHistory.length - 1,
      })),
    });
  },

  openInNewTab: (url, title) => {
    const tab = createTab(url, title ?? "New Page");
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }));
  },

  openProject: (projectId) => {
    get().navigate(`portfolio://project/${projectId}`, "Project Details");
  },

  goBack: () => {
    const state = get();
    set({
      tabs: withCurrentTab(state.tabs, state.activeTabId, (tab) => {
        if (tab.historyIndex <= 0) return tab;
        const historyIndex = tab.historyIndex - 1;
        const url = tab.history[historyIndex];
        return { ...tab, url, address: url, historyIndex };
      }),
    });
  },

  goForward: () => {
    const state = get();
    set({
      tabs: withCurrentTab(state.tabs, state.activeTabId, (tab) => {
        if (tab.historyIndex >= tab.history.length - 1) return tab;
        const historyIndex = tab.historyIndex + 1;
        const url = tab.history[historyIndex];
        return { ...tab, url, address: url, historyIndex };
      }),
    });
  },

  reload: () => set((state) => ({ reloadNonce: state.reloadNonce + 1 })),

  setAddress: (address) => {
    const state = get();
    set({
      tabs: withCurrentTab(state.tabs, state.activeTabId, (tab) => ({ ...tab, address })),
    });
  },

  toggleBookmarksBar: () => set((state) => ({ bookmarksBarVisible: !state.bookmarksBarVisible })),
  togglePrivacyMode: () => set((state) => ({ privacyMode: !state.privacyMode })),
}));
