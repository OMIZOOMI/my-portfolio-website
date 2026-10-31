import type { WorkspaceId } from "../../data/workspaces";

export const WORKSPACE_TRAVEL_MS = 800;
export type MotionStatus = "still" | "starting" | "playing" | "paused" | "unavailable";
export interface WorkspaceLayer { key: number; id: WorkspaceId; motion: MotionStatus }
interface Selection { key: number; id: WorkspaceId }
export interface WorkspaceTransition {
  layers: WorkspaceLayer[];
  active: number | null;
  incoming: number | null;
  phase: "idle" | "preparing" | "travelling";
  queued: Selection | null;
  error: { id: WorkspaceId; message: string } | null;
}
export const EMPTY_WORKSPACE: WorkspaceTransition = {
  layers: [], active: null, incoming: null, phase: "idle", queued: null, error: null,
};
export type WorkspaceAction =
  | { type: "select"; selection: Selection }
  | { type: "ready"; key: number; animate: boolean }
  | { type: "finish"; key: number }
  | { type: "failed"; key: number; message: string }
  | { type: "motion"; key: number; status: MotionStatus };

function prepare(state: WorkspaceTransition, selection: Selection): WorkspaceTransition {
  const active = state.layers.find((layer) => layer.key === state.active);
  if (active?.id === selection.id) {
    return { ...EMPTY_WORKSPACE, active: active.key, layers: [active] };
  }
  return {
    ...state, layers: [...(active ? [active] : []), { ...selection, motion: "still" }],
    incoming: selection.key, phase: "preparing", queued: null, error: null,
  };
}

function arrive(state: WorkspaceTransition): WorkspaceTransition {
  const incoming = state.layers.find((layer) => layer.key === state.incoming);
  if (!incoming) return state;
  const next = { ...EMPTY_WORKSPACE, active: incoming.key, layers: [incoming] };
  return state.queued && state.queued.id !== incoming.id ? prepare(next, state.queued) : next;
}

/** At most two media layers; a flight finishes once, retaining only the latest queued destination. */
export function workspaceTransition(state: WorkspaceTransition, action: WorkspaceAction): WorkspaceTransition {
  switch (action.type) {
    case "select": {
      if (state.phase === "travelling") {
        const incoming = state.layers.find((layer) => layer.key === state.incoming);
        return { ...state, queued: incoming?.id === action.selection.id ? null : action.selection };
      }
      if (state.phase === "preparing" && state.layers.find((layer) => layer.key === state.incoming)?.id === action.selection.id) return state;
      return prepare(state, action.selection);
    }
    case "ready":
      if (state.incoming !== action.key || state.phase !== "preparing") return state;
      return state.active !== null && action.animate ? { ...state, phase: "travelling" } : arrive(state);
    case "finish":
      return state.phase === "travelling" && state.incoming === action.key ? arrive(state) : state;
    case "failed": {
      if (state.incoming !== action.key || state.phase !== "preparing") return state;
      const failed = state.layers.find((layer) => layer.key === action.key);
      return {
        ...state, layers: state.layers.filter((layer) => layer.key === state.active),
        incoming: null, phase: "idle", queued: null,
        error: failed ? { id: failed.id, message: action.message } : null,
      };
    }
    case "motion":
      return state.layers.some((layer) => layer.key === action.key && layer.motion !== action.status)
        ? { ...state, layers: state.layers.map((layer) => layer.key === action.key ? { ...layer, motion: action.status } : layer) }
        : state;
  }
}
