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
  eyebrow: "Case study by Om Sawkare",
  role: "Solo project · Design and development",
  problem: "A list of website warnings leaves developers with questions. Where did each issue come from? What should they fix first? Veyra puts the evidence and the next step alongside each finding.",
  // Full-project ownership was confirmed by Om; commit ownership alone is not that evidence.
  contributionHeading: "What I built",
  contribution: "I built the local app from end to end, from entering a website address to reading the finished report. The report makes it easy to follow a finding back to the page that triggered it.",
  decisionHeading: "Evidence before conclusions",
  decision: "Veyra reads up to eight pages on the same site and applies the same checks to each page. The report shows what the scanner saw and what each observation supports. For example, finding one image without alt text tells you where to look first in an accessibility review.",
  tools: "Next.js and React show the report. Cheerio reads the HTML, and Zod checks that the report links each issue to valid evidence.",
  evidenceExample: {
    label: "Example from a scanner test",
    title: "How Veyra flags an image without alt text",
    steps: [
      { label: "Page HTML", content: '<img src="/image.png">', format: "code", note: "The image has no alt attribute." },
      { label: "What the scanner saw", content: "imagesWithoutAlt: 1", format: "code", badge: "Observed", note: "The scanner counts one image missing alt text." },
      { label: "What the report shows", content: "An image is missing alt text", badge: "Low severity", note: "The finding links back to the count." },
    ],
    actionLabel: "Useful next step",
    recommendation: "Review the image’s purpose. Add meaningful alternative text for informative images, or an empty alt attribute for decorative ones.",
    caveat: "This example uses test HTML. A person still needs to review the image and decide whether it needs a description.",
    sourceUrl: veyraSource("apps/scanner/src/investigate.test.ts#L311-L339"),
    sourceLabel: "Read the source test",
  },
  scopeNote: {
    title: "About the demo.",
    detail: "The demo uses sample data to show how a report looks. Live reports from the local scanner show findings from the pages it reads.",
  },
};
