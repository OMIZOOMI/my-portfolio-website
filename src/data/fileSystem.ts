// src/data/fileSystem.ts

export type FileItem = { 
    id: string; 
    name: string; 
    type: "folder" | "file" | "app"; 
  };
  
  export const FILE_SYSTEM: Record<string, FileItem[]> = {
    "desktop": [
      { id: "projects", name: "Projects", type: "folder" },
      { id: "about-me", name: "About Me", type: "folder" },
    ],
    "documents": [
      { id: "game", name: "Game", type: "folder" },
    ],
    "projects": [
      { id: "edge-ai-white-box", name: "Edge AI White Box", type: "file" },
      { id: "cloud-native-task-api", name: "Cloud Native Task API", type: "file" },
      { id: "sl-translator", name: "Sign Language Translator", type: "file" },
      { id: "smart-stick", name: "Smart Assistive Stick", type: "file" },
      { id: "vehicle-tracking", name: "GPS Vehicle Tracking", type: "file" }
    ],
    "about-me": [],
    "game": [
        { id: "Neural Block", name: "Neural Block.app", type: "app" }
    ]
  };