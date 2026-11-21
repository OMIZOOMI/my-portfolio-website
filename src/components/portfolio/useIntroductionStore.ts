"use client";

import { create } from "zustand";
import { INTRODUCTION_STORAGE_KEY, parseIntroductionStatus, type IntroductionStatus } from "../../data/introductionPreference";
import { useDisplayStore } from "../window-manager/useDisplayStore";

export const INTRODUCTION_STEPS = ["laptop", "screen", "projects", "terminal", "contact", "finish"] as const;
export type IntroductionStep = typeof INTRODUCTION_STEPS[number];
interface IntroductionState {
  hydrated: boolean;
  phase: "pending" | "welcome" | "active" | "dismissed";
  step: IntroductionStep;
  laptopAvailable: boolean;
  status: IntroductionStatus | null;
  storageAvailable: boolean;
  hydrate: () => void;
  replay: () => void;
  start: (laptopAvailable?: boolean) => void;
  next: (expected: IntroductionStep) => void;
  back: (expected: IntroductionStep) => void;
  skip: () => void;
  finish: (view: "screen" | "laptop") => void;
}

export const useIntroductionStore = create<IntroductionState>((set, get) => {
  const settle = (status: IntroductionStatus) => {
    // A replay skipped later does not downgrade an earlier completion.
    const finalStatus = get().status === "completed" ? "completed" : status;
    let storageAvailable = get().storageAvailable;
    try { window.localStorage.setItem(INTRODUCTION_STORAGE_KEY, JSON.stringify({ status: finalStatus })); }
    catch { storageAvailable = false; }
    if (status === "skipped") useDisplayStore.getState().endViewPreview(true);
    set({ phase: "dismissed", status: finalStatus, storageAvailable });
  };
  const showStep = (step: IntroductionStep) => {
    const display = useDisplayStore.getState();
    const screenView = step !== "laptop";
    if (display.screenView !== screenView) display.previewScreenView(screenView);
    set({ phase: "active", step });
  };
  return {
    hydrated: false, phase: "pending", step: "laptop", laptopAvailable: true, status: null, storageAvailable: true,
    hydrate: () => {
      if (get().hydrated || typeof window === "undefined") return;
      let status: IntroductionStatus | null = null, storageAvailable = true;
      try { status = parseIntroductionStatus(window.localStorage.getItem(INTRODUCTION_STORAGE_KEY)); }
      catch { storageAvailable = false; }
      set({ hydrated: true, phase: status ? "dismissed" : "welcome", status, storageAvailable });
    },
    replay: () => {
      if (get().phase === "active" || get().phase === "welcome") return;
      useDisplayStore.getState().endViewPreview();
      set({ hydrated: true, phase: "welcome", step: "laptop", laptopAvailable: true });
    },
    start: (laptopAvailable = true) => {
      if (get().phase !== "welcome") return;
      set({ laptopAvailable });
      showStep(laptopAvailable ? "laptop" : "screen");
    },
    next: expected => {
      const state = get();
      if (state.phase !== "active" || state.step !== expected || expected === "finish") return;
      showStep(INTRODUCTION_STEPS[INTRODUCTION_STEPS.indexOf(expected) + 1]);
    },
    back: expected => {
      const state = get();
      if (state.phase !== "active" || state.step !== expected) return;
      const index = INTRODUCTION_STEPS.indexOf(expected);
      if (index === (state.laptopAvailable ? 0 : 1)) {
        useDisplayStore.getState().endViewPreview();
        set({ phase: "welcome" });
        return;
      }
      showStep(INTRODUCTION_STEPS[index - 1]);
    },
    skip: () => { if (get().phase === "welcome" || get().phase === "active") settle("skipped"); },
    finish: view => {
      const state = get();
      if (state.phase !== "active" || state.step !== "finish" || (view !== "screen" && view !== "laptop") || (view === "laptop" && !state.laptopAvailable)) return;
      useDisplayStore.getState().setDefaultView(view);
      settle("completed");
    },
  };
});
