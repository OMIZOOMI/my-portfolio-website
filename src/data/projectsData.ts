export interface ProjectData {
  id: string;
  name: string;
  summary: string;
  description: string;
  stack: string[];
  architecture: string[];
  highlights: string[];
  repositoryUrl: string;
  accent: string;
}

export const PROJECTS: ProjectData[] = [
  {
    id: "edge-ai-hardware-state-detection",
    name: "Edge AI Hardware State Detection System",
    summary: "Real-time webcam inference for hardware-state recognition at the edge.",
    description:
      "A computer-vision pipeline that detects hardware states from live camera frames, combining a YOLOv8 model, Roboflow dataset tooling, LiteRT/TFLite deployment, and OpenCV stream processing.",
    stack: ["YOLOv8", "Roboflow", "LiteRT / TFLite", "OpenCV", "Python"],
    architecture: [
      "OpenCV captures and normalizes webcam frames.",
      "YOLOv8 performs object and state detection with confidence filtering.",
      "The LiteRT/TFLite runtime keeps inference portable on edge hardware.",
      "A lightweight result loop exposes labels, confidence, and timing to the UI.",
    ],
    highlights: [
      "Real-time webcam inference",
      "Edge-optimized model runtime",
      "False-positive handling and confidence thresholds",
    ],
    repositoryUrl: "https://github.com/OMIZOOMI/edge-ai-white-box",
    accent: "#ff7a45",
  },
  {
    id: "cloud-native-asset-management-api",
    name: "Cloud-Native Asset Management API",
    summary: "Containerized FastAPI services for reliable asset and task workflows.",
    description:
      "A cloud-ready backend architecture built around FastAPI, PostgreSQL, Docker, and AWS primitives, with clear separation between API, persistence, configuration, and deployment concerns.",
    stack: ["FastAPI", "PostgreSQL", "Docker", "AWS", "Python"],
    architecture: [
      "FastAPI exposes typed HTTP endpoints and validation boundaries.",
      "PostgreSQL stores durable asset metadata and workflow state.",
      "Docker packages the service for reproducible local and cloud runs.",
      "AWS architecture provides the deployment, networking, and storage path.",
    ],
    highlights: [
      "Typed REST API boundaries",
      "Persistent relational storage",
      "Reproducible container deployment",
    ],
    repositoryUrl: "https://github.com/OMIZOOMI/cloud-native-task-api",
    accent: "#4c8dff",
  },
  {
    id: "3d-macos-web-portfolio",
    name: "3D macOS Web Portfolio",
    summary: "An interactive portfolio OS rendered inside a 3D MacBook scene.",
    description:
      "A Next.js and React portfolio that turns the browser into a macOS-inspired desktop with draggable windows, app-specific stores, gesture interactions, dynamic wallpapers, and a portfolio-native project browser.",
    stack: ["Next.js", "React", "React Three Fiber", "Three.js", "Tailwind CSS", "Zustand"],
    architecture: [
      "Next.js App Router provides the client entry point and build pipeline.",
      "React Three Fiber renders the MacBook shell and HTML screen portal.",
      "Zustand coordinates windows, system settings, files, mail, browser, and music.",
      "Tailwind and CSS modules provide app-level visual systems and dark-mode behavior.",
    ],
    highlights: [
      "3D MacBook presentation layer",
      "Window manager with focus, minimize, maximize, and drag behavior",
      "Portfolio projects surfaced as Finder files and Safari favorites",
    ],
    repositoryUrl: "https://github.com/OMIZOOMI/my-portfolio-website",
    accent: "#bf5af2",
  },
];

export const PROJECTS_BY_ID = PROJECTS.reduce<Record<string, ProjectData>>((byId, project) => {
  byId[project.id] = project;
  return byId;
}, {});

export function getProjectById(id: string): ProjectData | null {
  return PROJECTS_BY_ID[id] ?? null;
}
