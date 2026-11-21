# Adobe Hackathon · Brand AI Readiness Audit

Adobe hackathon · Team project

One crawl, four perspectives on how a brand communicates.

Development lead · Co-built on a three-person team

## Hackathon result · Reported by Om

Top 45 teams — Among approximately 100,000 teams.

Team placement and approximate team count supplied by Om; not independently verified here.

## The problem

A brand can look convincing to a visitor while its returned HTML makes its identity, facts, or next steps difficult to understand. Our challenge was to turn those gaps into a practical audit, with evidence and useful recommendations for both machine readability and visitor experience.

## My contribution

I led development and co-built the audit with one teammate on our three-person team. We worked across the crawler, analyzer logic, and report pipeline, using Claude and GPT to help develop and refine the code. My focus was connecting the checks into a coherent, usable result.

## One crawl, shared evidence

Four process-isolated analyzers receive the same snapshot over stdin. This avoids repeated crawls and shared temporary-file collisions. The tradeoff is scope: an HTTP snapshot cannot reproduce a browser session. Missing or failed analysis is recorded as a coverage gap, while the composer merges overlapping findings and applies one severity policy.

The core runs as a Python command-line audit using the standard library; the marketplace manifest connects its five skills.

## Four perspectives, one report

Implementation diagram · Shared-crawl architecture

**1. Collect once** — One bounded HTTP snapshot. Sampled HTML, headers, crawl metadata and link observations.

**2. Analyze separately** — Four isolated analyzers. Crawl & HTML access; AI citability cues; Freshness & corroboration; Visitor engagement. Each reads the same observations without its own crawl.

**3. Compose centrally** — Prioritized JSON report. Evidence, suggested actions, merged findings and explicit coverage.

**Coverage belongs in the result** — Without supplied research, off-site corroboration remains not evaluated. Missing evidence does not become a claim that the brand lacks external coverage.

### Repository fixture report · Selected fields

```json
{
  "scope": "FC-10",
  "title": "Off-site corroboration of brand facts",
  "status": "NOT_EVALUATED"
}
```

These fields come from the repository’s generated test-fixture report. The fixture is synthetic; its timestamps and timings are normalized by the example generator. They are not performance measurements or hackathon judging evidence.

[Read the example report](https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/657e157b17f8fa9c0d9742d88f9c71d56b0ddec0/skills/audit-orchestrator/references/example-report.json)

This diagram is derived from the orchestrator and composer. It is an illustration of implemented code, not a product screenshot or an audit of a live brand.

[Read the orchestrator](https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/657e157b17f8fa9c0d9742d88f9c71d56b0ddec0/skills/audit-orchestrator/scripts/run_audit.py#L217-L312)

## Where it stands

A working Python command-line audit with four analyzers and validated JSON reports, packaged as an Agent Skills marketplace. Hackathon work; not an official Adobe product.

- Findings describe sampled HTTP/HTML responses. Target JavaScript is not executed, and client-side behavior is not fully assessed.
- Citability checks are technical and content heuristics; they do not measure or guarantee AI citations. Some semantic checks use English-language heuristics.
- Off-site corroboration requires separately supplied research data. Missing research and incomplete checks remain coverage limitations.

**Recommendations, not automatic changes.** The audit emits suggested fixes and verification guidance. It does not edit or deploy the target website. Optional agent-side semantic review is separate from the deterministic core.

## Repository

[Adobe Hackathon · Brand AI Readiness Audit](https://github.com/OMIZOOMI/brand-ai-readiness-audit)

## Implementation sources

- [Audit orchestrator](https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/657e157b17f8fa9c0d9742d88f9c71d56b0ddec0/skills/audit-orchestrator/scripts/run_audit.py)
- [Bounded crawler](https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/657e157b17f8fa9c0d9742d88f9c71d56b0ddec0/skills/audit-orchestrator/scripts/auditlib/crawler.py)
- [Crawl & HTML analyzer](https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/657e157b17f8fa9c0d9742d88f9c71d56b0ddec0/skills/crawl-render-audit/scripts/check_crawl_render.py)
- [Citability analyzer](https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/657e157b17f8fa9c0d9742d88f9c71d56b0ddec0/skills/ai-citability-audit/scripts/check_citability.py)
- [Freshness & corroboration analyzer](https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/657e157b17f8fa9c0d9742d88f9c71d56b0ddec0/skills/freshness-corroboration/scripts/check_freshness.py)
- [Engagement analyzer](https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/657e157b17f8fa9c0d9742d88f9c71d56b0ddec0/skills/engagement-audit/scripts/check_engagement.py)
- [Report composer & coverage](https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/657e157b17f8fa9c0d9742d88f9c71d56b0ddec0/skills/audit-orchestrator/scripts/auditlib/compose.py)
- [Composition regression tests](https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/657e157b17f8fa9c0d9742d88f9c71d56b0ddec0/tests/test_composition.py)
- [Skill manifest](https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/657e157b17f8fa9c0d9742d88f9c71d56b0ddec0/marketplace.json)
- [Fixture example generator](https://github.com/OMIZOOMI/brand-ai-readiness-audit/blob/657e157b17f8fa9c0d9742d88f9c71d56b0ddec0/tools/make_example_report.py)
