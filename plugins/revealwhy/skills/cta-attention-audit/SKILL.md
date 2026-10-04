---
name: cta-attention-audit
description: "Find call-to-action buttons visitors actually SEE but don't click, using measured exposure and attention (not guesswork heatmaps), with a cited expected lift and prerequisite checks. Use when: CTA not converting, button gets no clicks, seen but not clicked, ignored call-to-action, attention heatmap, above the fold, button prominence, hero section audit."
---

# CTA attention audit

Surface action elements visitors were genuinely **exposed to** but mostly didn't act on — the honest
"seen but not clicked" signal — and pair each with the evidence layer.

## Workflow

1. `list_findings` (optionally `pageKeyId` for one page). Keep findings with
   `deviationType == "attention_miss"` on action elements.
2. For each, read `evidence[]` (`seen`, `acted`, `missRate`), `basis`, `confidence`. Call
   `get_finding_evidence` for the strongest ones when the user wants proof.
3. **Rank by people lost** (seen − acted), not miss-rate alone.
4. Context per page: `get_top_elements` (pageUrl) shows what *does* win attention there — often the
   competitor stealing the click. `get_element_performance` with the CTA's selector gives dwell/hover/CTR.
5. Present: the element, the change (`change`), the mechanism (`mechanism`, a hypothesis), and the
   evidence-layer payload.

## Reading the payload

- `expectedLift { rangePct, medianPct, basis }`: `prior` → "comparable prominence changes lift
  acted-on-seen +R% in testing"; `rw_calibrated` → "RevealWhy-measured: +M% over N of your tests".
- `percentileFrame`: "p{band} for {vertical} {stage} in the RevealWhy network" — only when present.
- `prerequisiteChecks`: if `no_competing_sibling` or `not_load_bound` is `unmet`/`unknown`, tell the user
  to verify it first — the lift assumes it.

Never invent an attention_miss the engine didn't emit, even if a best practice says the CTA is weak.

Related: `funnel-conformance` when the loss is multi-step; `ab-test-readout` once a fix is under test.
