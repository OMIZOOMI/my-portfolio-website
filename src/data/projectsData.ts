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
  finderIcon?: string;
  preview?: { src: string; width: number; height: number; alt: string; caption: string };
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
    summary: "Find website issues, see the evidence, and know what to fix first.",
    description: "Veyra checks a small set of pages on a website and explains what it finds. Each issue links back to the page evidence so a developer can verify it before making a fix.",
    status: "In development",
    statusDetail: "The local tool scans pages and generates reports. The demo report uses sample data.",
    stack: ["Next.js", "React", "TypeScript", "Zod", "Cheerio", "HTTP/HTML analysis"],
    architecture: ["Enter a website address in the local app.", "The scanner reads HTML and response headers from up to eight pages on the same site.", "The report shows which evidence supports each issue."],
    capabilities: ["Checks up to eight pages", "Links each finding to its source", "Shows a separate sample report"],
    limitations: ["The tool reads the pages as served. It skips content that depends on JavaScript.", "Reports cover a sample of the site. Scanning currently runs locally."],
    futurePlans: ["Add browser-based checks and optional AI-assisted analysis."],
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
    finderIcon: "/project-icons/veyra.png",
    preview: { src: "/project-previews/veyra.webp", width: 1280, height: 848,
      alt: "The Veyra sample report for acme.example showing issue status and evidence counts.",
      caption: "Veyra’s sample report shows what was checked and where to find the evidence. This demo uses sample data." },
    caseStudy: VEYRA_CASE_STUDY,
  },
  {
    id: "adobe-brand-audit", key: "adobe", aliases: ["brand-ai-readiness-audit"],
    name: "Adobe Hackathon · Brand AI Readiness Audit", featured: true, publicSlug: "adobe-brand-audit",
    summary: "We audited a brand website and showed its team what to fix first.",
    description: "Our Adobe Hackathon project checks whether people and AI tools can find, understand, and trust information on a brand website. It puts four sets of checks into one report with suggested fixes.",
    status: "Hackathon project",
    statusDetail: "Our team built a working Python command-line tool that runs four sets of checks and produces a structured report for review.",
    stack: ["Python", "Standard library", "HTTP crawling", "Subprocess analyzers"],
    architecture: ["The tool collects a sample of pages once.", "Four independent checks review the same pages for access, AI references, freshness, and ease of use.", "The final report groups related issues and orders them by severity."],
    capabilities: ["Runs four sets of checks from one crawl", "Records incomplete checks", "Pairs findings with evidence and suggested fixes"],
    limitations: ["The audit checks the HTML the server returns. Interactive pages need separate testing.", "AI citation indicators estimate how easy a page is to reference. Some checks rely on English text.", "Checking whether other sources back up brand claims requires separate research."],
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
    finderIcon: "/project-icons/adobe-brand-audit.png",
    preview: { src: "/project-previews/adobe-report.webp", width: 1200, height: 630,
      alt: "Sample audit report showing that none of six pages had readable structured data and suggesting a fix for the home page.",
      caption: "One finding and its suggested fix from the sample report in the project repository. The report uses test data." },
    caseStudy: ADOBE_CASE_STUDY,
  },
  {
    // This legacy ID already pointed to the white-box repository. Keep it so
    // moved files, open windows and browser histories retain their identities.
    id: "edge-ai-hardware-state-detection", key: "white-box", aliases: ["edge-ai-white-box"],
    name: "White Box Detection", featured: false, publicSlug: "white-box",
    summary: "Teach a webcam to spot a small white box among lookalike objects.",
    description: "I trained a small YOLOv8 model to spot a white paper box on camera. I tested it against lookalikes such as sheets of paper and white chargers, then adjusted it to reduce false alarms.",
    status: "Vision prototype",
    statusDetail: "The repository includes the webcam script and trained model. The project notes explain the dataset and training process.",
    stack: ["Python", "YOLOv8 Nano", "Roboflow", "LiteRT/TFLite", "OpenCV"],
    architecture: ["OpenCV reads frames from a webcam.", "The exported LiteRT model checks each frame for the box.", "Matches over the confidence threshold get a label and a rectangle on screen."],
    capabilities: ["Runs the detector on live webcam video", "Shows what the model detects", "Uses lookalike objects to improve the detector"],
    limitations: ["The project notes describe the training process. The repository contains the exported model and detection script.", "The demo shows selected tests. Accuracy and speed across devices still need measurement."],
    futurePlans: [],
    evidence: [
      { label: "Webcam inference", url: source("edge-ai-white-box", "detect.py"), basis: "implementation" },
      { label: "Training and dataset notes", url: source("edge-ai-white-box", "README.md"), basis: "project-notes" },
    ],
    repositoryUrl: github + "/edge-ai-white-box", accent: "#ff7a45",
    finderIcon: "/project-icons/white-box.png",
    preview: { src: "/project-previews/white-box.webp", width: 1000, height: 386,
      alt: "Two webcam frames. The detector outlines a white box on the left. A flat white sheet on the right has no outline.",
      caption: "The model marks the box on the left and leaves the paper unmarked in the frame on the right. The 96% label is the model’s confidence for that detection." },
    caseStudy: {
      eyebrow: "Computer vision case study",
      role: "Dataset, model training, and webcam demo",
      problem: "A small white box can look like a flat sheet of paper or a charger on a webcam. The challenge was to recognize the box and reduce false alarms from lookalikes.",
      contributionHeading: "What I built",
      contribution: "I prepared the dataset, trained a small YOLOv8 model, and exported it to LiteRT. I built a live webcam demo that draws a rectangle around each detection.",
      decisionHeading: "Test with lookalikes",
      decision: "I added photos of flat white paper as examples the model should ignore. I then tuned the confidence threshold so the rectangle stayed visible on the target during the demo.",
      tools: "YOLOv8 and Roboflow for training, with LiteRT and OpenCV for the webcam demo.",
      evidenceExample: {
        label: "Webcam demo",
        title: "One target and one lookalike",
        steps: [
          { label: "Show the target", content: "The detector draws a green rectangle around the white box.", note: "The label above it shows confidence for that frame." },
          { label: "Show a lookalike", content: "The flat sheet of white paper is unmarked in the second frame.", note: "Both frames are from the original demo." },
        ],
        actionLabel: "How to read the result",
        recommendation: "Use the frames to see what the model does. Testing more backgrounds, lighting, and cameras would show how consistently it works.",
        caveat: "These are selected frames from the demo recording.",
        sourceUrl: source("edge-ai-white-box", "README.md"),
        sourceLabel: "See the demo and training notes",
      },
      scopeNote: { title: "Project files.", detail: "The repository includes the trained model and webcam script." },
    },
  },
  {
    id: "tigergraph-fraud-investigation", key: "tigergraph", aliases: [],
    name: "TigerGraph Fraud Investigation", featured: false,
    summary: "Show how relationships between transactions can help review a fraud alert.",
    description: "This prototype uses TigerGraph to connect transaction records and compare alerts with earlier cases. The report explains the evidence, the open questions, and what a reviewer could do next.",
    status: "Benchmark prototype",
    statusDetail: "The benchmark includes graph lookups, local case history, and a structured review report.",
    stack: ["Python", "TigerGraph", "LangGraph", "Gemini", "pandas"],
    architecture: ["LangGraph coordinates the investigation steps.", "TigerGraph finds related records and local case history gives context.", "The report brings the evidence and suggested next step together for a human reviewer."],
    capabilities: ["Finds related records", "Looks up earlier cases", "Explains recommendations for human review"],
    limitations: ["Some customer evidence in the benchmark is simulated.", "The workflow needs real-world testing before it can be used to make fraud decisions."],
    futurePlans: [],
    evidence: [
      { label: "Investigation graph", url: source("tigergraph-fraud-investigation", "agent/graph.py"), basis: "implementation" },
      { label: "Evidence and persistence tools", url: source("tigergraph-fraud-investigation", "agent/tools.py"), basis: "implementation" },
      { label: "Python dependencies", url: source("tigergraph-fraud-investigation", "requirements.txt"), basis: "dependencies" },
    ],
    repositoryUrl: github + "/tigergraph-fraud-investigation", accent: "#8670a6",
    finderIcon: "/project-icons/tigergraph-fraud-investigation.png",
  },
  {
    id: "3d-macos-web-portfolio", key: "portfolio", aliases: ["my-portfolio-website"],
    name: "Interactive 3D Portfolio", featured: false, finderIcon: "/project-icons/portfolio.png",
    summary: "Explore my work inside a 3D laptop with apps you can actually use.",
    description: "Open Finder to browse my projects, try a Terminal command, or play Heat Sink. The same desktop can fill your screen for easier reading.",
    status: "In development",
    statusDetail: "The portfolio includes a 3D workspace, a full-page Screen view, and a simpler reading layout for touch devices.",
    stack: ["Next.js", "React", "TypeScript", "React Three Fiber", "Three.js", "Zustand", "MediaPipe"],
    architecture: ["Next.js and React render the site and its apps.", "React Three Fiber renders the laptop around a working web desktop.", "Zustand keeps track of windows, files, and preferences."],
    capabilities: ["Switch between laptop and full-page desktop", "Open, move, and resize app windows", "Try camera gestures, music, keyboard sounds, and a game"],
    limitations: ["The camera requires permission. The 3D view depends on browser and device support."],
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
