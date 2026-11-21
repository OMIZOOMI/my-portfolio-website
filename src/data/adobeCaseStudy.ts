import type { ProjectCaseStudy } from "./projectCaseStudies";

export const ADOBE_REVIEW_COMMIT = "657e157b17f8fa9c0d9742d88f9c71d56b0ddec0";
export const adobeSource = (path: string) =>
  `https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/${ADOBE_REVIEW_COMMIT}/${path}`;

export const ADOBE_CASE_STUDY: ProjectCaseStudy = {
  eyebrow: "Adobe hackathon · Team project",
  role: "Development lead · Co-built on a three-person team",
  problem: "A brand can look convincing to a visitor while its returned HTML makes its identity, facts, or next steps difficult to understand. Our challenge was to turn those gaps into a practical audit, with evidence and useful recommendations for both machine readability and visitor experience.",
  contributionHeading: "My contribution",
  // Team size, leadership and shared implementation are Om's supplied account.
  contribution: "I led development and co-built the audit with one teammate on our three-person team. We worked across the crawler, analyzer logic, and report pipeline, using Claude and GPT to help develop and refine the code. My focus was connecting the checks into a coherent, usable result.",
  decisionHeading: "One crawl, shared evidence",
  decision: "Four process-isolated analyzers receive the same snapshot over stdin. This avoids repeated crawls and shared temporary-file collisions. The tradeoff is scope: an HTTP snapshot cannot reproduce a browser session. Missing or failed analysis is recorded as a coverage gap, while the composer merges overlapping findings and applies one severity policy.",
  tools: "The core runs as a Python command-line audit using the standard library; the marketplace manifest connects its five skills.",
  reportedResult: {
    title: "Top 45 teams",
    detail: "Among approximately 100,000 teams.",
    attribution: "Team placement and approximate team count supplied by Om; not independently verified here.",
  },
  evidenceExample: {
    label: "Implementation diagram · Shared-crawl architecture",
    title: "Four perspectives, one report",
    steps: [
      { label: "Collect once", content: "One bounded HTTP snapshot", note: "Sampled HTML, headers, crawl metadata and link observations." },
      { label: "Analyze separately", content: "Four isolated analyzers", items: ["Crawl & HTML access", "AI citability cues", "Freshness & corroboration", "Visitor engagement"], note: "Each reads the same observations without its own crawl." },
      { label: "Compose centrally", content: "Prioritized JSON report", note: "Evidence, suggested actions, merged findings and explicit coverage." },
    ],
    actionLabel: "Coverage belongs in the result",
    recommendation: "Without supplied research, off-site corroboration remains not evaluated. Missing evidence does not become a claim that the brand lacks external coverage.",
    caveat: "This diagram is derived from the orchestrator and composer. It is an illustration of implemented code, not a product screenshot or an audit of a live brand.",
    sourceUrl: adobeSource("skills/audit-orchestrator/scripts/run_audit.py#L217-L312"),
    sourceLabel: "Read the orchestrator",
    excerpt: {
      title: "Repository fixture report · Selected fields",
      content: '{\n  "scope": "FC-10",\n  "title": "Off-site corroboration of brand facts",\n  "status": "NOT_EVALUATED"\n}',
      caption: "These fields come from the repository’s generated test-fixture report. The fixture is synthetic; its timestamps and timings are normalized by the example generator. They are not performance measurements or hackathon judging evidence.",
      sourceUrl: adobeSource("skills/audit-orchestrator/references/example-report.json"),
      sourceLabel: "Read the example report",
    },
  },
  scopeNote: {
    title: "Recommendations, not automatic changes.",
    detail: "The audit emits suggested fixes and verification guidance. It does not edit or deploy the target website. Optional agent-side semantic review is separate from the deterministic core.",
  },
};
