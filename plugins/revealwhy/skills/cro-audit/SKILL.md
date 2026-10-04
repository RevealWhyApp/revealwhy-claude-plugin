---
name: cro-audit
description: "Full website conversion (CRO) audit grounded in real visitor behaviour — KPIs, where visitors drop off, ignored CTAs, unread content, and a ranked fix list with evidence, confidence and expected lift. Use when the user asks: why isn't my website converting, audit my landing page, how is my site doing, conversion rate optimization, UX audit, what should I fix first, improve signups/sales/leads."
---

# Website conversion audit (RevealWhy)

Answer "what should I fix on my site, and why?" from **measured behaviour**, not generic best practice.
Every claim comes from a RevealWhy MCP tool result. If a tool returns nothing, say so — never fill gaps with
folklore.

## Workflow

1. **Health first** — `get_project_status`. If tracking isn't sending data or nothing is processed yet,
   stop and help the user fix setup (see the `revealwhy-setup` skill). An audit on no data is fiction.
2. **Where we stand** — `get_report` (sessions, conversions, conversion rate, stories, opportunities).
   Add `get_traffic` (days 30) for trend if the user cares about change over time.
3. **What's broken** — `list_findings` with `status: "suggested"`. Group by `deviationType`:
   - `attention_miss` → CTAs seen but not acted on (deep-dive: `cta-attention-audit`)
   - `skipped_step` / `stalled` / `forced_transition` / `wrong_order` / `extra_step` → journey leaks
     (deep-dive: `funnel-conformance`)
   - `value_prop_unread` → key content not read (`get_content_performance` for the page)
   - `unresponsive` → elements people click that do nothing (rage/dead clicks) — usually a bug, fix first
4. **Where people leave** — `analyze_dropoff`; cross-reference with the findings on those pages.
5. **Rank** by people lost / recoverable conversions (finding `impact`, `moneyImpact` when present),
   not by percentage alone. Unresponsive-element bugs jump the queue.
6. **Deliver** a table of the top 5:
   | # | Page | Change | Why (mechanism) | Basis · confidence | Expected lift | Prerequisites |
   then 2–3 sentences of narrative and the obvious next step (test it: see `ab-test-readout`).

## Honesty contract (non-negotiable)

- State each finding's `basis` (proven > observed > principle > simulated) and `confidence`. Never upgrade them.
- `expectedLift.basis == "prior"` → "comparable changes lift … in published testing", never "this will
  increase X". Only `rw_calibrated` may be stated as RevealWhy-measured on this site.
- `prerequisiteChecks` that are `unmet`/`unknown` → say what to verify before shipping.
- `percentileFrame` absent means "no network baseline", not "average".
- The mechanism is a hypothesis about *why*; present it as such.
