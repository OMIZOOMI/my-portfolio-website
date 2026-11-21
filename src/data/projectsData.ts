import { VEYRA_CASE_STUDY, veyraSource, type ProjectCaseStudy } from "./projectCaseStudies";
import { ADOBE_CASE_STUDY, adobeSource } from "./adobeCaseStudy";

export interface ProjectEvidence {
  label: string;
  url: string;
  basis: "implementation" | "dependencies" | "project-notes";
}

export interface ProjectData {
  /** Existing file/window/history identity. A display rename must not change this. */
  id: string;
  key: string;
  aliases: readonly string[];
  name: string;
  featured: boolean;
  summary: string;
  description: string;
  status: string;
  statusDetail: string;
  stack: readonly string[];
  architecture: readonly string[];
  capabilities: readonly string[];
  limitations: readonly string[];
  futurePlans: readonly string[];
  evidence: readonly ProjectEvidence[];
  repositoryUrl: string;
  accent: string;
  caseStudy?: ProjectCaseStudy;
  /** Public reading route; internal IDs and simulator addresses stay separate. */
  publicSlug?: string;
}

const github = "https://github.com/OMIZOOMI";
const source = (repository: string, path: string) => github + "/" + repository + "/blob/main/" + path;

/** Shared display order for all apps. Only the first two projects are featured. */
export const PROJECTS: readonly ProjectData[] = [
  {
    id: "veyra", key: "veyra", aliases: ["Cross-Exam"], name: "Veyra", featured: true, publicSlug: "veyra",
    summary: "Website investigation, with evidence behind each finding.",
    description: "I'm building Veyra to turn a website's page evidence into clear, useful reports. The current implementation investigates a bounded set of HTTP/HTML pages and connects deterministic findings to their observations.",
    status: "In development",
    statusDetail: "Local HTTP/HTML investigation and live reports are implemented. The separate demo report uses synthetic fixtures.",
    stack: ["Next.js", "React", "TypeScript", "Zod", "Cheerio", "HTTP/HTML analysis"],
    architecture: ["A local Next.js form and scan handler admit bounded investigation requests.", "The scanner collects eligible HTML and response headers through a shared request boundary.", "Typed report contracts connect findings to compact evidence and the report UI."],
    capabilities: ["Bounded page discovery", "Deterministic findings with evidence references", "Live investigation reports and a separate fixture demo"],
    limitations: ["Target-page JavaScript is not executed. Browser scanning and AI-provider execution are unavailable.", "This is a local investigation tool, not a verified public scanning service or a complete site audit."],
    futurePlans: ["Browser scanning and AI-provider execution remain future work."],
    evidence: [
      { label: "HTTP investigator & bounds", url: veyraSource("apps/scanner/src/investigate.ts"), basis: "implementation" },
      { label: "Local scan handler", url: veyraSource("apps/web/src/lib/scan-handler.ts"), basis: "implementation" },
      { label: "Evidence & report contracts", url: veyraSource("packages/contracts/src/index.ts"), basis: "implementation" },
      { label: "HTML observations & finding rules", url: veyraSource("apps/scanner/src/report.ts"), basis: "implementation" },
      { label: "Finding-to-evidence interface", url: veyraSource("apps/web/src/components/finding-row.tsx"), basis: "implementation" },
      { label: "Browser execution gate", url: veyraSource("apps/browser-worker/src/index.ts"), basis: "implementation" },
      { label: "Agent provider contracts", url: veyraSource("packages/agents/src/index.ts"), basis: "implementation" },
      { label: "Dependency lockfile", url: veyraSource("pnpm-lock.yaml"), basis: "dependencies" },
    ],
    repositoryUrl: github + "/Cross-Exam", accent: "#4977ad",
    caseStudy: VEYRA_CASE_STUDY,
  },
  {
    id: "adobe-brand-audit", key: "adobe", aliases: ["brand-ai-readiness-audit"],
    name: "Adobe Hackathon · Brand AI Readiness Audit", featured: true, publicSlug: "adobe-brand-audit",
    summary: "One crawl, four perspectives on how a brand communicates.",
    description: "My Adobe hackathon work examines crawl accessibility, AI citability, freshness and corroboration, and engagement. Four analyzers share one bounded crawl, then compose evidence, coverage limits, and practical recommendations into a report.",
    status: "Hackathon project",
    statusDetail: "A working Python command-line audit with four analyzers and validated JSON reports, packaged as an Agent Skills marketplace. Hackathon work; not an official Adobe product.",
    stack: ["Python", "Standard library", "HTTP crawling", "Subprocess analyzers"],
    architecture: ["One bounded HTTP crawl produces the shared snapshot.", "Four process-isolated analyzers inspect that snapshot; failures become coverage limitations.", "The composer merges duplicate findings, groups root causes, and applies a common severity policy."],
    capabilities: ["Shared crawl across four audit pillars", "Analyzer failure containment", "Evidence and coverage-aware report composition"],
    limitations: ["Findings describe sampled HTTP/HTML responses. Target JavaScript is not executed, and client-side behavior is not fully assessed.", "Citability checks are technical and content heuristics; they do not measure or guarantee AI citations. Some semantic checks use English-language heuristics.", "Off-site corroboration requires separately supplied research data. Missing research and incomplete checks remain coverage limitations."],
    futurePlans: [],
    evidence: [
      { label: "Audit orchestrator", url: adobeSource("skills/audit-orchestrator/scripts/run_audit.py"), basis: "implementation" },
      { label: "Bounded crawler", url: adobeSource("skills/audit-orchestrator/scripts/auditlib/crawler.py"), basis: "implementation" },
      { label: "Crawl & HTML analyzer", url: adobeSource("skills/crawl-render-audit/scripts/check_crawl_render.py"), basis: "implementation" },
      { label: "Citability analyzer", url: adobeSource("skills/ai-citability-audit/scripts/check_citability.py"), basis: "implementation" },
      { label: "Freshness & corroboration analyzer", url: adobeSource("skills/freshness-corroboration/scripts/check_freshness.py"), basis: "implementation" },
      { label: "Engagement analyzer", url: adobeSource("skills/engagement-audit/scripts/check_engagement.py"), basis: "implementation" },
      { label: "Report composer & coverage", url: adobeSource("skills/audit-orchestrator/scripts/auditlib/compose.py"), basis: "implementation" },
      { label: "Composition regression tests", url: adobeSource("tests/test_composition.py"), basis: "implementation" },
      { label: "Skill manifest", url: adobeSource("marketplace.json"), basis: "implementation" },
      { label: "Fixture example generator", url: adobeSource("tools/make_example_report.py"), basis: "implementation" },
    ],
    repositoryUrl: github + "/brand-ai-readiness-audit", accent: "#a56253",
    caseStudy: ADOBE_CASE_STUDY,
  },
  {
    // This legacy ID already pointed to the white-box repository. Keep it so
    // moved files, open windows and browser histories retain their identities.
    id: "edge-ai-hardware-state-detection", key: "white-box", aliases: ["edge-ai-white-box"],
    name: "White Box Detection", featured: false,
    summary: "Detecting a small white paper box while working to reject similar distractors.",
    description: "A computer-vision project focused on detection and hard negatives. The inference script loads an exported TFLite model through Ultralytics, processes webcam frames with OpenCV, and filters detections by confidence.",
    status: "Vision prototype",
    statusDetail: "The repository includes the webcam inference script and exported model. YOLOv8 Nano training and Roboflow dataset work are described in its project notes.",
    stack: ["Python", "YOLOv8 Nano", "Roboflow", "LiteRT/TFLite", "OpenCV"],
    architecture: ["OpenCV captures webcam frames for the detector.", "Ultralytics loads best.tflite and runs inference on each captured frame.", "Detections above 0.50 confidence receive boxes, labels, and timing logs."],
    capabilities: ["TFLite webcam inference", "Confidence filtering and detection overlays", "Hard-negative iteration described in the project notes"],
    limitations: ["The repository does not include the complete training pipeline; YOLOv8 Nano and Roboflow training details are author-reported.", "Accuracy and device performance have not been independently measured in this portfolio review."],
    futurePlans: [],
    evidence: [
      { label: "Webcam inference", url: source("edge-ai-white-box", "detect.py"), basis: "implementation" },
      { label: "Training and dataset notes", url: source("edge-ai-white-box", "README.md"), basis: "project-notes" },
    ],
    repositoryUrl: github + "/edge-ai-white-box", accent: "#ff7a45",
  },
  {
    id: "tigergraph-fraud-investigation", key: "tigergraph", aliases: [],
    name: "TigerGraph Fraud Investigation", featured: false,
    summary: "Graph evidence and human-readable investigation recommendations.",
    description: "An investigation workflow connects graph relationships, prior-case memory, and Gemini reasoning. Its structured outputs make supporting evidence, uncertainty, recommended action, and approval routing visible to a reviewer.",
    status: "Benchmark prototype",
    statusDetail: "LangGraph orchestration, TigerGraph evidence tools, local case-history fallback, and structured case output are implemented for benchmark investigations.",
    stack: ["Python", "TigerGraph", "LangGraph", "Gemini", "pandas"],
    architecture: ["LangGraph routes investigation, decisions, optional simulated evidence, and case persistence.", "TigerGraph MCP tools retrieve graph evidence; pandas reads local precedent when needed.", "Structured case results retain evidence context and recommendations for human review."],
    capabilities: ["Graph evidence retrieval", "Local precedent fallback", "Structured recommendations and evidence context"],
    limitations: ["Customer-evidence steps include simulation and require clear interpretation.", "Benchmark code does not establish bank deployment, real-world fraud accuracy, or the correctness of model conclusions."],
    futurePlans: [],
    evidence: [
      { label: "Investigation graph", url: source("tigergraph-fraud-investigation", "agent/graph.py"), basis: "implementation" },
      { label: "Evidence and persistence tools", url: source("tigergraph-fraud-investigation", "agent/tools.py"), basis: "implementation" },
      { label: "Python dependencies", url: source("tigergraph-fraud-investigation", "requirements.txt"), basis: "dependencies" },
    ],
    repositoryUrl: github + "/tigergraph-fraud-investigation", accent: "#8670a6",
  },
  {
    id: "cloud-native-asset-management-api", key: "task-api", aliases: ["cloud-native-task-api"],
    name: "Cloud-Native Task API", featured: false,
    summary: "Relational users, projects, and tasks behind a typed API.",
    description: "A backend project exploring validation, relational modeling, and request-scoped database sessions. The checked-in implementation uses FastAPI, Pydantic, SQLAlchemy, and local SQLite.",
    status: "Local API prototype",
    statusDetail: "Create routes for users, projects, and tasks plus a task-list route are implemented. The database is SQLite, not a deployed PostgreSQL service.",
    stack: ["Python", "FastAPI", "Pydantic", "SQLAlchemy", "SQLite"],
    architecture: ["FastAPI routes validate incoming data through Pydantic models.", "SQLAlchemy models relate users, projects, and tasks using foreign keys.", "A request-scoped session writes to the configured local SQLite database and closes after use."],
    capabilities: ["Typed create routes and task listing", "Relational SQLAlchemy models", "Request-scoped database sessions"],
    limitations: ["The checked-in code does not establish Docker packaging, AWS deployment, JWT authentication, or distributed execution.", "The user route does not hash the supplied password; this is a learning prototype, not a production authentication service."],
    futurePlans: ["PostgreSQL migration is described as a direction in the repository README; it is not implemented by the current database configuration."],
    evidence: [
      { label: "FastAPI routes and models", url: source("cloud-native-task-api", "task_manager_api/main.py"), basis: "implementation" },
      { label: "SQLite configuration", url: source("cloud-native-task-api", "task_manager_api/database.py"), basis: "implementation" },
      { label: "Relational models", url: source("cloud-native-task-api", "task_manager_api/models.py"), basis: "implementation" },
    ],
    repositoryUrl: github + "/cloud-native-task-api", accent: "#4c8dff",
  },
  {
    id: "skywatch", key: "skywatch", aliases: [], name: "SkyWatch", featured: false,
    summary: "Air-traffic telemetry on a 3D globe, with kinematic anomaly checks.",
    description: "A shared OpenSky polling loop feeds WebSocket clients. A dead-reckoning engine compares expected and observed positions, while a React and Three.js globe visualizes the stream.",
    status: "Telemetry prototype",
    statusDetail: "The Deno backend broadcasts shared telemetry and kinematic flags to a React globe client.",
    stack: ["Deno", "TypeScript", "WebSockets", "React", "React Three Fiber", "Three.js"],
    architecture: ["One global polling loop normalizes OpenSky telemetry before broadcasting it.", "A bounded previous-state map supports position projection and deviation checks.", "WebSocket clients receive shared updates for visualization in a React/Three.js globe."],
    capabilities: ["Shared telemetry broadcasting", "Dead-reckoning position comparisons", "3D air-traffic visualization"],
    limitations: ["Deviation flags are kinematic heuristics, not verified incidents or safety judgments.", "Live data availability depends on the upstream feed. No FPS or deployment result is asserted here."],
    futurePlans: [],
    evidence: [
      { label: "Shared polling and WebSockets", url: source("Skywatch", "backend/mod.ts"), basis: "implementation" },
      { label: "Anomaly engine", url: source("Skywatch", "backend/anomaly_engine.ts"), basis: "implementation" },
      { label: "Globe dependencies", url: source("Skywatch", "frontend/package.json"), basis: "dependencies" },
    ],
    repositoryUrl: github + "/Skywatch", accent: "#528b82",
  },
  {
    id: "3d-macos-web-portfolio", key: "portfolio", aliases: ["my-portfolio-website"],
    name: "Interactive 3D Portfolio", featured: false,
    summary: "A small desktop made for exploring the person behind the code.",
    description: "Apps, windows, camera gestures, music, and a tactile keyboard live inside a 3D laptop. This portfolio brings scene rendering and ordinary HTML interfaces together to make the work approachable and interactive.",
    status: "In development",
    statusDetail: "This local portfolio includes the desktop, app stores, media lifecycles, and a projected screen with a readable Screen view.",
    stack: ["Next.js", "React", "TypeScript", "React Three Fiber", "Three.js", "Zustand", "MediaPipe"],
    architecture: ["Next.js and React provide the application entry and interactive components.", "React Three Fiber renders the laptop around the HTML desktop screen.", "Zustand stores coordinate windows, files, preferences, and individual app state."],
    capabilities: ["Interactive 3D laptop and desktop", "Window management and app-specific state", "Camera gestures, Music, and keyboard feedback"],
    limitations: ["The local checkout can include newer work than the public repository.", "Camera and 3D behavior depend on browser/device support. Some app content remains intentionally unfinished."],
    futurePlans: [],
    evidence: [
      { label: "Project dependencies", url: source("my-portfolio-website", "package.json"), basis: "dependencies" },
      { label: "Desktop implementation", url: source("my-portfolio-website", "src/components/desktop/DesktopEnvironment.tsx"), basis: "implementation" },
      { label: "Laptop scene", url: source("my-portfolio-website", "src/components/webcam/MacBookScene.tsx"), basis: "implementation" },
    ],
    repositoryUrl: github + "/my-portfolio-website", accent: "#bf5af2",
  },
];

export const PROJECTS_BY_ID: Readonly<Record<string, ProjectData>> = Object.fromEntries(
  PROJECTS.map((project) => [project.id, project]),
);

/** Resolve aliases without rewriting file IDs, tab URLs or retained history. */
const PROJECT_REFERENCES = new Map(PROJECTS.flatMap((project) =>
  [project.id, project.key, ...project.aliases].map((reference) => [reference.toLowerCase(), project] as const),
));

export function getProjectById(id: string): ProjectData | null {
  return PROJECT_REFERENCES.get(id.toLowerCase()) ?? null;
}

export function getProjectOverview(project: ProjectData): string {
  return [project.description, project.status + ". " + project.statusDetail,
    ...project.limitations, ...project.futurePlans.map((plan) => "Future work: " + plan)].join(" ");
}
