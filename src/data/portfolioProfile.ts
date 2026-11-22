/** Personal history supplied by Om; technical examples resolve through the project catalogue. */
export const PORTFOLIO_PROFILE = {
  name: "Om Sawkare",
  role: "Computer vision, AI workflows, and backend development.",
  purpose: "An interactive portfolio of the things I build and the ideas behind them.",
  education: "Final-year Computer Science student at Vellore Institute of Technology.",
  introduction: "I build tools that help people inspect website issues, understand data, and make sense of what a camera sees.",
  email: "sawkare.om@gmail.com",
  github: "https://github.com/OMIZOOMI",
  linkedin: "https://www.linkedin.com/in/om-sawkare",
} as const;

export const SKILL_GROUPS = [
  { title: "Website investigation", detail: "Check a set of pages and show the evidence behind each finding.", projects: ["veyra", "adobe"] },
  { title: "Computer vision", detail: "Find objects on a webcam and teach the model to ignore lookalikes.", projects: ["white-box"] },
  { title: "AI workflows & graph evidence", detail: "Use related records and earlier cases to explain a recommendation.", projects: ["tigergraph"] },
  { title: "Interactive interfaces", detail: "Build web apps that work inside a 3D laptop and in a full-page desktop.", projects: ["portfolio"] },
] as const;

export const PROJECT_EXPERIENCE = [
  { title: "What I'm building now", detail: "I’m building Veyra so developers can see what triggered a website warning and decide what to fix first.", projects: ["veyra", "portfolio"] },
  { title: "Team Lead at Adobe Hackathon", detail: "Our tool checks a brand website from four angles and combines the results in one report. My team reached the top 45 among approximately 100,000 teams.", projects: ["adobe"] },
  { title: "Learning through applied projects", detail: "White Box taught me how to reduce false alarms. TigerGraph taught me how to explain a recommendation with evidence.", projects: ["white-box", "tigergraph"] },
] as const;
