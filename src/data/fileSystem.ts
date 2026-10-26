import { PROJECTS } from "./projectsData";

export type FileItem = { 
    id: string; 
    name: string; 
    type: "folder" | "file" | "app"; 
  };
  
export const FILE_SYSTEM: Record<string, FileItem[]> = {
    "desktop": [
      { id: "projects", name: "Projects", type: "folder" },
      { id: "about-me", name: "About Me", type: "folder" },
      { id: "bin", name: "Bin", type: "folder" },
    ],
    "documents": [
      { id: "game", name: "Game", type: "folder" },
    ],
    "projects": PROJECTS.map((project) => ({ id: project.id, name: project.name, type: "file" as const })),
    "about-me": [],
    "game": [
        { id: "Neural Block", name: "Neural Block.app", type: "app" }
    ],
    "bin": []
  };
