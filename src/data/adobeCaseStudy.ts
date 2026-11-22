import type { ProjectCaseStudy } from "./projectCaseStudies";

export const ADOBE_REVIEW_COMMIT = "657e157b17f8fa9c0d9742d88f9c71d56b0ddec0";
export const adobeSource = (path: string) =>
  `https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/${ADOBE_REVIEW_COMMIT}/${path}`;

export const ADOBE_CASE_STUDY: ProjectCaseStudy = {
  eyebrow: "Hackathon case study",
  role: "Team Lead at Adobe Hackathon · Three-person team",
  problem: "A brand website can look polished while making basic facts or next steps hard to find. We wanted to show where visitors and AI tools might struggle to understand the brand website and give its team a clear list of fixes.",
  contributionHeading: "My contribution",
  // Team size, leadership and shared implementation are Om's supplied account.
  contribution: "I led development on our three-person team and built the audit with one teammate. We wrote the website crawler, the checks, and the final report, with help from Claude and GPT. I focused on making the four sets of results read as one report.",
  decisionHeading: "One crawl, shared evidence",
  decision: "We collect the pages once so each check works from the same evidence. If a check fails or needs more information, the report marks it as incomplete. Related findings are merged so the team can focus on the underlying problem.",
  tools: "We built the command-line audit in Python and packaged it as reusable Agent Skills.",
  reportedResult: {
    title: "Top 45 teams",
    detail: "Among approximately 100,000 teams.",
    attribution: "Placement and approximate team count reported by Om.",
  },
  evidenceExample: {
    label: "How the audit works",
    title: "Four perspectives, one report",
    steps: [
      { label: "Collect pages", content: "One sample of the brand website", note: "The crawler reads pages, links, and server responses." },
      { label: "Check the sample", content: "Four independent checks", items: ["Page access", "How easy facts are to cite", "How current and well supported facts are", "Ease of use"], note: "Each check uses the same pages." },
      { label: "Build the report", content: "A list of fixes in priority order", note: "Each entry shows its evidence, a suggested fix, and the limits of the check." },
    ],
    actionLabel: "What happens when evidence is missing",
    recommendation: "If the team hasn’t supplied outside research, the report marks that check as “Not evaluated.”",
    caveat: "The diagram shows how the project combines its checks using a sample report.",
    sourceUrl: adobeSource("skills/audit-orchestrator/scripts/run_audit.py#L217-L312"),
    sourceLabel: "Read the orchestrator",
    excerpt: {
      title: "Example report entry",
      content: '{\n  "scope": "FC-10",\n  "title": "Off-site corroboration of brand facts",\n  "status": "NOT_EVALUATED"\n}',
      caption: "The repository generates this example from test data.",
      sourceUrl: adobeSource("skills/audit-orchestrator/references/example-report.json"),
      sourceLabel: "Read the example report",
    },
  },
  scopeNote: {
    title: "The website team makes the changes.",
    detail: "The report suggests fixes and explains how to check them. Any AI-assisted review happens separately from the core checks.",
  },
};
