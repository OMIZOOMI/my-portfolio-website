/** Personal history supplied by Om; technical examples resolve through the project catalogue. */
export const PORTFOLIO_PROFILE = {
  name: "Om Sawkare",
  role: "Computer vision, AI workflows, and backend development.",
  purpose: "An interactive portfolio of the things I build and the ideas behind them.",
  education: "Final-year Computer Science student at VIT.",
  introduction: "I build systems that turn observations into something useful: a clearer website report, a more thoughtful detection pipeline, or an interface that makes complex work easier to explore.",
  email: "sawkare.om@gmail.com",
  github: "https://github.com/OMIZOOMI",
  linkedin: "https://www.linkedin.com/in/om-sawkare",
} as const;

export const SKILL_GROUPS = [
  { title: "Website investigation", detail: "Bounded crawls, typed reports, and findings that stay connected to evidence.", projects: ["veyra", "adobe"] },
  { title: "Computer vision", detail: "Webcam inference, confidence filtering, and learning from the objects a detector should ignore.", projects: ["white-box"] },
  { title: "AI workflows & graph evidence", detail: "Connecting graph relationships and case history to recommendations a person can inspect.", projects: ["tigergraph"] },
  { title: "Backend & real-time data", detail: "Input validation, relational models, request lifecycles, and shared telemetry streams.", projects: ["task-api", "skywatch"] },
  { title: "Interactive interfaces", detail: "Bringing HTML, 3D scenes, application state, and media lifecycles together.", projects: ["portfolio"] },
] as const;

export const PROJECT_EXPERIENCE = [
  { title: "What I'm building now", detail: "Veyra is my current focus: making website observations useful without hiding what the evidence can and cannot support. This portfolio is where I explore how people encounter that work.", projects: ["veyra", "portfolio"] },
  { title: "Team work at the Adobe hackathon", detail: "Our brand-audit project brings four perspectives into one report from a shared crawl. My team reached the top 45 among approximately 100,000 teams — a result I’m proud to share alongside the work itself.", projects: ["adobe"] },
  { title: "Learning through applied projects", detail: "White Box taught me to pay attention to false positives. TigerGraph brought evidence and uncertainty into focus; the Task API and SkyWatch gave me practice with data relationships and real-time systems.", projects: ["white-box", "tigergraph", "task-api", "skywatch"] },
] as const;
