# @revealwhy/mcp-server

**Ask Claude why your website isn't converting.** This is a Model Context Protocol server for
[RevealWhy](https://revealwhy.com). It gives Claude Code, Claude Desktop and any MCP client read access to
your site's behavioural analytics: grounded CRO findings, drop-off and journeys, attention and content
engagement, conversions and goals, A/B test verdicts, and AI-agent traffic.

> Using Claude Code? Install the **RevealWhy plugin** instead (`/plugin marketplace add RevealWhyApp/revealwhy-claude-plugin`,
> then `/plugin install revealwhy@revealwhy`). It bundles this server with ready-made audit skills.

## Quick start

1. In RevealWhy, open **Settings → Developers → Secret API keys** and create a key with scopes `read:analytics` and
   `read:findings`. It starts with `rw_`.
2. Add the server. Until the package is on npm, use the self-contained bundle from the public plugin repo
   (`git clone https://github.com/RevealWhyApp/revealwhy-claude-plugin`), whose file is
   `plugins/revealwhy/server/revealwhy-mcp.mjs`. Once the package is published, replace
   `node <bundle>` with `npx -y @revealwhy/mcp-server`.

**Claude Code**

```bash
claude mcp add revealwhy --env REVEALWHY_API_KEY=rw_... --env REVEALWHY_PROJECT_ID=your-project-id -- node /path/to/revealwhy-mcp.mjs
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "revealwhy": {
      "command": "node",
      "args": ["/path/to/revealwhy-mcp.mjs"],
      "env": { "REVEALWHY_API_KEY": "rw_...", "REVEALWHY_PROJECT_ID": "your-project-id" }
    }
  }
}
```

Requires Node.js 18 or later.

## Tools (51: 40 read-only, 9 writes, 2 that connect without a key)

Every tool except the two connect tools takes an optional `projectId`, which defaults to `REVEALWHY_PROJECT_ID`.

| Area | Tool | What it answers |
|---|---|---|
| Connect | `start_free` | No key yet: a link and a short code for the person to approve a free project. Nothing is created until they do |
| | `start_free_status` | Whether they approved. Once they have, this session has a read-only key for that project |
| Overview | `get_project_status` | Is tracking healthy and is data processed? |
| Setup | `get_tracking_snippet` | The publishable key and the script tag to install RevealWhy on a site (never a secret key) |
| | `get_report` | KPIs, behavioural stories, top opportunities |
| | `get_traffic` | Daily sessions; `trafficClass` human / ai_agent / crawler |
| | `get_trends` | One metric by day / week / month from the permanent daily summaries (outlive raw data) |
| | `get_agent_traffic` | How AI assistants and crawlers read the site |
| Pages & journeys | `get_top_pages`, `list_pages` | Most-visited and analyzed pages |
| | `analyze_dropoff` | Where visitors leave, and the signals why |
| | `get_journey_analytics` | Paths, entry/exit, conversion paths (filter by date/device/country) |
| | `get_visitor_journeys` | Multi-session journeys per returning visitor |
| Attention & content | `get_top_elements`, `get_element_performance` | What gets seen, hovered and clicked |
| | `get_content_performance` | Which content is read, skimmed or ignored |
| | `get_attention_calibration` | Predicted vs measured attention |
| Conversions & goals | `list_conversion_goals`, `get_conversion_stats`, `list_conversion_events` | Goals, rates, events |
| | `list_goals`, `get_goal_journey`, `suggest_goals` | Goal performance, journey to goal, detected goals |
| Findings | `list_findings`, `get_finding`, `get_finding_evidence` | What to fix and why, with evidence |
| | `get_progress`, `get_audience`, `get_site_graph`, `list_template_groups` | Maturity, segments, structure |
| Experiments | `list_experiments`, `get_experiment_verdict` | A/B tests and always-valid verdicts with SRM |
| | `get_scoreboard`, `list_improvements`, `get_autopilot` | Cumulative impact and earned autonomy |
| Agent tasks | `list_agent_tasks`, `get_agent_task` | What to fix, in the shared agent-task shape (scope, element, evidence, basis, suggested change, measured impact, status) |
| | `report_fix` (write) | Tell RevealWhy a fix is live: marks it `fixed` and records what changed and when |
| | `set_finding_status` (write) | `sent_to_agent`, `fixed`, `dismissed` or `open`. Measured outcomes can't be set. A RevealWhy extension: not part of the shared agent-task contract |
| Heatmaps, replays & tests | `get_heatmap` | Measured clicks on one page, element by element |
| | `get_replay_link` | A dashboard link to one session's replay (members only, not a public share) |
| | `list_site_goals` | The site goals RevealWhy inferred, and which are confirmed |
| | `list_studies`, `get_study` | User-testing studies, their tasks and status |
| Actions | `start_ab_test` (write) | Create an A/B test as a draft; nothing reaches visitors until the owner approves the start |
| | `set_ab_test_status` (write) | Ask to conclude or archive a test; the owner approves it from the link RevealWhy returns |
| | `create_goal`, `confirm_site_goal` (write) | Configure a conversion goal; confirm, reject or rename an inferred site goal |
| | `create_study` (write) | Create a user test as a draft; nobody is invited until a project member opens it |
| Predicted & simulated | `predict_attention` (write, `run:synthetic`) | Where a visitor is likely to look, labelled Predicted (a model, not measured) |
| | `screen_variants` (write, `run:synthetic`) | Rank 2 to 5 variant URLs before traffic, labelled simulated (at most 10 runs an hour per project) |

The writes need a key with the `write:findings` scope as well (`predict_attention` and `screen_variants` need
`run:synthetic` instead). A/B tests and studies an assistant creates are drafts, and changing a test's status is the
owner's approval: nothing reaches a visitor or participant until the owner starts it. A task's status runs `open` → `sent_to_agent` →
`fixed` → `verifying` → `verified` / `not_improved` / `inconclusive` / `not_enough_data`, or `dismissed`; only
RevealWhy's measurement sets the last four, and `measured_impact` stays null until it has.

**Prompts:** `site_audit`, `why_not_converting`, `experiment_review` and `ai_traffic_report`.

## The honesty contract

Findings carry `basis` (proven › observed › principle › simulated), a calibrated `confidence`, and an evidence
layer: `expectedLift` (a research `prior` until your own tests make it `rw_calibrated`), `percentileFrame`
and `prerequisiteChecks`. The server passes these through untouched, and its instructions tell the model
never to upgrade them.

## Configuration

| Variable | Default |
|---|---|
| `REVEALWHY_API_KEY` | required (legacy `INSIGHTFLOW_API_KEY` accepted) |
| `REVEALWHY_PROJECT_ID` | none; pass `projectId` per call |
| `REVEALWHY_API_URL` | `https://api.revealwhy.com` |
| `REVEALWHY_MAX_RESPONSE_CHARS` | `60000` (larger results are truncated with a note) |
| `REVEALWHY_FINDINGS_FIXTURE` | dev only: serve the findings tools from a local JSON file |

Without a key, the server still starts, and each tool returns setup instructions instead of failing.

## Troubleshooting

- **401**: the key is missing, mistyped or revoked.
- **403 "lacks the required scope"**: recreate the key with both read scopes (and `write:findings` for the two writes).
- **403 "Access denied to this project"**: the key belongs to a different project.
- **Empty results**: the tracking snippet isn't installed yet, or there's no traffic yet.

## Development

The plugin runs `plugins/revealwhy/server/revealwhy-mcp.mjs`, a deterministic esbuild bundle of `mcp-server/src`. To rebuild it:

```bash
cd mcp-server
npm ci
npm run build    # typecheck + dist/
npm run bundle   # regenerates ../plugins/revealwhy/server/revealwhy-mcp.mjs
```

This repository is published from the RevealWhy monorepo; open issues here.

## Security

- Read-only except `report_fix` and `set_finding_status`, which only move a task through its lifecycle (nothing is
  deleted, and `set_finding_status open` undoes either) and need the `write:findings` scope.
- Use scoped `rw_…` keys, which are hashed at rest and revocable. Avoid the site's tracking key: it is
  embedded in your public pages.
- Keys are never logged. All traffic goes over HTTPS to the configured API URL only.

MIT
