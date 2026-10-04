---
name: ab-test-readout
description: "Read out A/B test and experiment results correctly — winner, loser or inconclusive, lift, sample ratio mismatch (SRM) and whether it's safe to call — plus the cumulative impact scoreboard. Use when: did my A/B test win, experiment results, split test significance, is my test done, conversion lift, which variant won, what did my changes achieve."
---

# A/B test readout

Report experiment outcomes with the statistical honesty of RevealWhy's always-valid (mSPRT) engine — no
peeking errors, no premature calls.

## Workflow

1. `list_experiments` — status, variants, linked goal/finding.
2. For each running or recently concluded experiment: `get_experiment_verdict` → per-variant verdict,
   lift and SRM.
3. Classify each:
   - **Winner / loser** only when the verdict says decisive.
   - **Inconclusive / needs traffic** — below the burn-in (~100 per arm) no verdict is possible; say how
     far off it is rather than guessing.
   - **SRM warning** — the traffic split is off; results are untrustworthy until the cause (bot filter,
     redirect, caching) is found. Never call a winner on an SRM-failing test.
4. `get_scoreboard` for the cumulative "am I winning?" picture; `list_improvements` for shipped changes
   measured observationally (before/after with control — weaker than a randomized test; say so).
5. `get_progress` shows how many findings are now `proven` — a decisive, SRM-clean win promotes its
   finding to `basis: proven`.

## Output

Table: experiment · status · variant · lift · verdict · SRM · recommendation. Then one line on cumulative
impact. Starting, stopping and concluding tests is done in the RevealWhy dashboard.
