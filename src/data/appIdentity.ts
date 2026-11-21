/** Visitor labels only. App kinds, file/window IDs and stored references stay stable. */
export const APP_LABELS: Record<string, string> = {
  finder: "Files", safari: "Browser", facetime: "Camera", music: "Music",
  notes: "Notes", mail: "Mail", terminal: "Terminal", settings: "Settings",
  bin: "Files", "about-app": "Portfolio", "about-me": "About Me",
  "file-viewer": "Preview", "neural-block": "Neural Block", "heat-sink": "Heat Sink",
};

const legacyAboutNames: Record<string, string> = {
  Finder: "Files", Safari: "Browser", FaceTime: "Camera", "Apple Music": "Music",
};

export function appWindowTitle(window: { kind: string; title: string; id: string; folderId?: string }) {
  if (["safari", "facetime", "music", "notes", "mail", "terminal", "settings"].includes(window.kind)) return APP_LABELS[window.kind];
  if (window.kind === "finder" && (!window.folderId || window.folderId === "desktop") && window.title === "Finder") return APP_LABELS.finder;
  if (window.kind === "about-app") {
    const subject = window.id.replace(/^about-/, "");
    if (subject === "portfolio") return "About This Portfolio";
    if (APP_LABELS[subject]) return `About ${APP_LABELS[subject]}`;
    const oldName = window.title.replace(/^About /, "");
    if (legacyAboutNames[oldName]) return `About ${legacyAboutNames[oldName]}`;
  }
  // A folder merely named Safari/Finder/etc. is still that visitor's folder.
  return window.title;
}
