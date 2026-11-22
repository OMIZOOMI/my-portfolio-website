import { PROJECTS, getProjectById, getProjectOverview } from "./projectsData";
import { PORTFOLIO_PROFILE as profile } from "./portfolioProfile";

export interface TerminalLine { text: string; tone?: "heading" | "muted" | "error"; href?: string }
export interface TerminalProject { key: string; name: string; summary: string; stack: string; repository: string; detail: string; status: string }
const github = "https://github.com/OMIZOOMI";
// Compatibility projection for the existing Terminal renderer, not a second catalogue.
export const TERMINAL_PROJECTS: TerminalProject[] = PROJECTS.map(project => ({
  key: project.key, name: project.name, repository: project.repositoryUrl,
  stack: project.stack.join(" · "), summary: project.summary,
  detail: getProjectOverview(project), status: project.status,
}));
/** The opening screen exposes three useful paths; the full command set remains
 * available in the prompt and help response for visitors who want it. */
export const TERMINAL_SUGGESTIONS = ["projects", "skills", "about"];
const education = profile.education.replace(/^Final-year/, "I’m a final-year");
export const TERMINAL_INTRO: TerminalLine[] = [
  { text: "Hey there!", tone: "heading" },
  { text: `${education} I work on computer vision, AI tools, backends, and interactive apps.` },
  { text: "Lego robots and Halo got me curious about technology. These days I’m building Veyra and experimenting with how people and AI tools read websites." },
  { text: "Type a command below, or choose a starting point. This is an interactive portfolio, not a system shell.", tone: "muted" },
];
export function terminalResponse(input: string): TerminalLine[] {
  const [command, ...args] = input.trim().toLowerCase().split(/\s+/);
  const query = args.join(" ");
  if (["about", "whoami"].includes(command)) return [
    { text: "Om Sawkare / builder, learner, curious by default", tone: "heading" },
    { text: "Long before code, I built Lego robots and marvelled at Halo's Spartan armor. Today, that curiosity takes the form of computer vision, AI workflows, and backend development." },
    { text: "My main focus is Veyra, a tool that shows the evidence behind website issues. I also led an Adobe Hackathon team that reached the top 45 among roughly 100,000 teams." },
    { text: "Technology is only as powerful as the impact on a person's day to day.", tone: "muted" },
  ];
  if (command === "help") return [
    { text: "A few ways in", tone: "heading" },
    { text: "about / whoami   The person behind the projects\nskills           Tools and the problems I use them for\nprojects / ls    Explore the projects and their repositories\nproject <name>   A closer look: veyra, adobe, white-box,\n                 tigergraph, portfolio\nexperience       Learning through building\ncontact          Find me online\ngithub           Open my GitHub profile\npwd              Where you are\nclear            A fresh terminal" },
    { text: "↑ / ↓ recalls commands. Escape skips a response. Links open GitHub in a new tab.", tone: "muted" },
  ];
  if (["projects", "ls"].includes(command)) {
    const projects = TERMINAL_PROJECTS.filter(p => !query || `${p.key} ${p.name} ${p.stack}`.toLowerCase().includes(query));
    return [{ text: "Selected work / open the source", tone: "heading" },
      ...projects.flatMap(p => [{ text: `↗ ${p.name}`, href: p.repository }, { text: p.summary }, { text: `${p.status} · ${p.stack}`, tone: "muted" as const }]),
      ...(!projects.length ? [{ text: `No projects match “${query}”. Try projects without a filter.` }] : []),
      { text: "More on GitHub ↗", href: github }];
  }
  if (command === "project") {
    const reference = getProjectById(query) ?? PROJECTS.find(project => project.name.toLowerCase() === query);
    const p = reference && TERMINAL_PROJECTS.find(project => project.key === reference.key);
    return p ? [{ text: p.name, tone: "heading" }, { text: p.detail }, { text: p.stack, tone: "muted" }, { text: "View repository on GitHub ↗", href: p.repository }]
      : [{ text: "Choose a project: veyra, adobe, white-box, tigergraph, portfolio.", tone: "muted" }];
  }
  if (command === "skills") return [
    { text: "My toolkit / what these tools help me build", tone: "heading" },
    { text: "LANGUAGES\nPython, TypeScript / JavaScript, C++, Java" },
    { text: "VISION & EDGE\nYOLOv8, OpenCV, Roboflow, LiteRT/TFLite: detection, hard negatives, and live camera pipelines." },
    { text: "EVIDENCE & AI WORKFLOWS\nTigerGraph, LangGraph, Gemini, pandas: connecting evidence to decisions people can inspect." },
    { text: "BACKEND & DATA\nFastAPI, Pydantic, SQLAlchemy, REST APIs: validation, relational modeling, and clear service boundaries." },
    { text: "INTERFACES & REAL-TIME SYSTEMS\nReact, Next.js, Three.js, React Three Fiber, Zustand, Deno, WebSockets." },
    { text: "CLOUD DIRECTION\nAWS and cloud architecture are part of my learning focus. Individual repositories show what is implemented today.", tone: "muted" },
  ];
  if (command === "experience") return [
    { text: "Experience, through building", tone: "heading" },
    { text: `${education} I’ve built a website checker, led a brand website audit, trained a detector to ignore lookalikes, and used graph data to explain fraud alerts.` },
    { text: "Building this desktop taught me how much the small details matter when people use an interface." },
    { text: "I value evidence over impressive labels, and systems that remain useful when something goes wrong.", tone: "muted" },
  ];
  if (command === "contact") return [
    { text: "Let's build something useful.", tone: "heading" },
    { text: "GitHub · OMIZOOMI ↗", href: github },
    { text: "LinkedIn · Om Sawkare ↗", href: "https://www.linkedin.com/in/om-sawkare" },
    { text: "Email · sawkare.om@gmail.com", href: "mailto:sawkare.om@gmail.com" },
  ];
  if (command === "github") return [{ text: "Explore OMIZOOMI on GitHub ↗", href: github }];
  if (command === "pwd") return [{ text: "~/om/portfolio — your own path through my work", tone: "muted" }];
  return [{ text: `Command not found: ${input.trim()}. Try help.`, tone: "error" }];
}
