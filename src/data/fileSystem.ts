import { PROJECTS } from "./projectsData";
import { APPS_FOLDER_ID } from "./portfolioApps";

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
    "documents": [],
    "projects": PROJECTS.filter((project) => !project.hideInFinder)
      .map((project) => ({ id: project.id, name: project.name, type: "file" as const })),
    "about-me": [],
    [APPS_FOLDER_ID]: [],
    "bin": []
  };
