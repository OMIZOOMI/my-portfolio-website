import { PROJECTS } from "./projectsData";
import { APPS_FOLDER_ID } from "./portfolioApps";

export type FileItem = { 
    id: string; 
    name: string; 
    type: "folder" | "file" | "app"; 
  };

export const PORTFOLIO_DOCUMENTS = new Map([
  ["resume", { name: "Om Sawkare Resume.pdf", url: "/documents/om-sawkare-resume.pdf" }],
  ["google-it-support-certificate", { name: "Google IT Support Certificate.pdf", url: "/documents/google-it-support-certificate.pdf" }],
  ["internship-certificate", { name: "Internship Certificate.pdf", url: "/documents/om-sawkare-internship-certificate.pdf" }],
]);
  
export const FILE_SYSTEM: Record<string, FileItem[]> = {
    "desktop": [
      { id: "projects", name: "Projects", type: "folder" },
      { id: "about-me", name: "About Me", type: "folder" },
      { id: "bin", name: "Bin", type: "folder" },
    ],
    "documents": Array.from(PORTFOLIO_DOCUMENTS, ([id, { name }]) => ({ id, name, type: "file" })),
    "projects": PROJECTS.map((project) => ({ id: project.id, name: project.name, type: "file" as const })),
    "about-me": [],
    [APPS_FOLDER_ID]: [],
    "bin": []
  };
