---
name: funnel-conformance
description: "Find the exact funnel step where visitors are lost — abandon vs detour — ranked by recoverable conversions, from real journeys on your site. Use when: funnel drop-off, checkout abandonment, signup flow leaking, onboarding drop-off, where do users leave, conversion bottleneck, user journey analysis, why don't people finish."
---

# Funnel conformance

Localise the single step where goal-seeking visitors are lost and *how* (abandoned vs detoured), ranked by
recoverable conversions — largest leak first — not raw percentage drop.

## Workflow

1. **Pick the goal** — `list_goals`. If none fit, `suggest_goals` shows detected-but-unconfigured goals
   (the user configures them in the RevealWhy dashboard).
2. **Journey to that goal** — `get_goal_journey` (goalId): the paths goal-seekers take and where they fall out.
3. **Leaks** — `analyze_dropoff` for page-to-page exits with behavioural signals; `get_journey_analytics`
   with `device`/`convertedOnly` to compare segments (mobile vs desktop is the classic split).
4. **Why** — `list_findings`, keep `deviationType` in `skipped_step`, `stalled`, `forced_transition`,
   `wrong_order`, `extra_step`. Each carries the step coordinate, failure mode and impact, gated by a
   conformal interval (`confidence` reflects it).
5. **Lead with the largest recoverable leak**; list the rest as secondary. Attach expected lift and
   prerequisite checks where present.

## Honesty

- A funnel finding on simulated (digital-twin) data has `basis: "simulated"` — a labelled prior that real
  traffic must confirm. Say so.
- Small samples: if the confidence interval is wide, recommend measuring longer rather than acting.
- Returning visitors: `get_visitor_journeys` shows multi-session paths — a "drop-off" may be a visitor who
  comes back and converts later.

Related: `cta-attention-audit` when the loss localises to one element.
