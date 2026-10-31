export type WorkspaceId = "beach" | "forest" | "studio" | "paper" | "slate" | "ink" | "graphite" | "chalk" | "stone" | "sage" | "mist";

export interface Workspace {
  id: WorkspaceId;
  name: string;
  description: string;
  kind: "motion" | "still" | "color";
  poster?: string;
  thumbnail?: string;
  color?: string;
  video?: string;
  credit: string;
  source?: string;
}

export const WORKSPACES: readonly Workspace[] = [
  {
    id: "beach", kind: "motion", name: "Beach", description: "Gentle surf · fixed camera · Full HD",
    poster: "/workspaces/beach-hd.webp", thumbnail: "/workspaces/thumbs/beach-hd.webp",
    video: "/workspaces/beach-hd.mp4", credit: "Edgar Fernandez / Mixkit",
    source: "https://mixkit.co/free-stock-video/waves-reaching-the-shore-1925/",
  },
  {
    id: "forest", kind: "motion", name: "Forest", description: "Moving leaves · fixed camera · Full HD",
    poster: "/workspaces/forest-hd.webp", thumbnail: "/workspaces/thumbs/forest-hd.webp",
    video: "/workspaces/forest-hd.mp4", credit: "Mixkit",
    source: "https://mixkit.co/free-stock-video/the-wind-gently-moves-the-forests-lush-vegetation-on-a-50870/",
  },
  {
    id: "studio", kind: "still", name: "Studio", description: "A little room to think",
    poster: "/workspaces/studio.png", thumbnail: "/workspaces/thumbs/studio.webp",
    credit: "Original generated artwork",
  },
  {
    id: "paper", kind: "still", name: "Paper", description: "Ivory paper, soft daylight",
    poster: "/workspaces/paper.png", thumbnail: "/workspaces/thumbs/paper.webp",
    credit: "Original generated artwork",
  },
  {
    id: "slate", kind: "still", name: "Slate", description: "Sculptural plaster, quiet shadows",
    poster: "/workspaces/slate.png", thumbnail: "/workspaces/thumbs/slate.webp",
    credit: "Original generated artwork",
  },
  { id: "ink", kind: "color", name: "Ink", description: "Deep blue-black", color: "#15191f", credit: "Original color palette" },
  { id: "graphite", kind: "color", name: "Graphite", description: "Soft charcoal", color: "#34383c", credit: "Original color palette" },
  { id: "chalk", kind: "color", name: "Chalk", description: "Warm off-white", color: "#e7e4de", credit: "Original color palette" },
  { id: "stone", kind: "color", name: "Stone", description: "Warm taupe", color: "#a79c8d", credit: "Original color palette" },
  { id: "sage", kind: "color", name: "Sage", description: "Muted green", color: "#81928b", credit: "Original color palette" },
  { id: "mist", kind: "color", name: "Mist", description: "Quiet blue-gray", color: "#667889", credit: "Original color palette" },
];

export const WORKSPACE_STORAGE_KEY = "portfolio-workspace";
export const DEFAULT_WORKSPACE: WorkspaceId = "beach";

export function getWorkspace(id: unknown): Workspace {
  return WORKSPACES.find((workspace) => workspace.id === id) ?? WORKSPACES[0];
}

export function parseWorkspacePreference(raw: string | null): WorkspaceId {
  try {
    const data = raw ? JSON.parse(raw) : null;
    return getWorkspace(data?.state?.environment ?? data?.environment).id;
  } catch { return DEFAULT_WORKSPACE; }
}

/** Only a location is saved: no window, drag, media, pause or transition state. */
export function serializeWorkspacePreference(environment: WorkspaceId): string {
  return JSON.stringify({ version: 1, state: { environment: getWorkspace(environment).id } });
}
