export interface ProjectCaseStudy {
  eyebrow: string;
  role: string;
  problem: string;
  contributionHeading: string;
  contribution: string;
  decisionHeading: string;
  decision: string;
  tools: string;
  reportedResult?: { title: string; detail: string; attribution: string };
  evidenceExample: {
    label: string;
    title: string;
    steps: readonly {
      label: string;
      content: string;
      format?: "code";
      badge?: string;
      note: string;
      items?: readonly string[];
    }[];
    actionLabel: string;
    recommendation: string;
    caveat: string;
    sourceUrl: string;
    sourceLabel: string;
    excerpt?: { title: string; content: string; caption: string; sourceUrl: string; sourceLabel: string };
  };
  scopeNote: { title: string; detail: string };
}

/** Source snapshot reviewed for U03. Names and navigation IDs stay in projectsData. */
export const VEYRA_REVIEW_COMMIT = "9bafdb5df0d97668abd66e09fa342610da323ace";
export const veyraSource = (path: string) =>
  `https://github.com/OMIZOOMI/Cross-Exam/blob/${VEYRA_REVIEW_COMMIT}/${path}`;

export const VEYRA_CASE_STUDY: ProjectCaseStudy = {
  eyebrow: "An ongoing project by Om Sawkare",
  role: "Solo project · Product, scanner & report interface",
  problem: "A website report is useful when a developer can understand what was checked, see the evidence, and decide what to fix. I’m building Veyra to connect those steps, rather than leave someone with an unexplained list of warnings.",
  // Full-project ownership was confirmed by Om; commit ownership alone is not that evidence.
  contributionHeading: "What I built",
  contribution: "Veyra is my solo project: I built the investigation flow, the bounded HTTP/HTML scanner, the local scan handler, and the report interface. The work connects backend boundaries and typed data with an interface that lets people follow a finding back to its source.",
  decisionHeading: "Evidence before conclusions",
  decision: "The current implementation keeps observations separate from conclusions. It collects eligible HTML and response headers from up to eight pages on one origin; deterministic rules then link findings to recorded evidence. Zod contracts check those references. A missing attribute can support a specific finding, but it cannot establish a complete accessibility or security verdict.",
  tools: "Next.js and React present the reports; TypeScript and Zod define their contracts; Cheerio inspects the returned HTML.",
  evidenceExample: {
    label: "Implementation diagram · Controlled test input",
    title: "One missing attribute, one traceable finding",
    steps: [
      { label: "Returned HTML", content: '<img src="/image.png">', format: "code", note: "An image without an alt attribute." },
      { label: "Observation", content: "imagesWithoutAlt: 1", format: "code", badge: "Observed", note: "Recorded as document structure." },
      { label: "Finding", content: "Images omit the alt attribute", badge: "Derived · Low severity", note: "The rule points back to that observation." },
    ],
    actionLabel: "Useful next step",
    recommendation: "Review the image’s purpose. Add meaningful alternative text for informative images, or an empty alt attribute for decorative ones.",
    caveat: "This illustrates a controlled scanner test, not a live website report or product screenshot. Returned HTML alone cannot determine whether an image is informative or decorative.",
    sourceUrl: veyraSource("apps/scanner/src/investigate.test.ts#L311-L339"),
    sourceLabel: "Read the source test",
  },
  scopeNote: {
    title: "Demo ≠ live investigation.",
    detail: "The separate demo report is synthetic fixture data. Its agent activity, experiments, and performance charts are not results from the live HTTP/HTML investigator.",
  },
};
