# @revealwhy/mcp-server

**Ask Claude why your website isn't converting.** This is a Model Context Protocol server for
[RevealWhy](https://revealwhy.com). It gives Claude Code, Claude Desktop and any MCP client access to
your site's behavioural analytics (reads, plus a few scoped write actions; see Security): grounded CRO findings, drop-off and journeys, attention and content
engagement, conversions and goals, A/B test verdicts, and AI-agent traffic.

> Using Claude Code? Install the **RevealWhy plugin** instead (`/plugin marketplace add RevealWhyApp/revealwhy-claude-plugin`,
> then `/plugin install revealwhy@revealwhy`). It bundles this server with ready-made audit skills.

## Quick start

1. In RevealWhy, open **Settings → Developers → Secret API keys** and create a key with scopes `read:analytics` and
   `read:findings`. It starts with `rw_`.
2. Add the server. Until the package is on npm, use the self-contained bundle from the public plugin repo
   (`git clone https://github.com/RevealWhyApp/revealwhy-claude-plugin`), whose file is
   `plugins/revealwhy/server/revealwhy-mcp.mjs`. The package is not yet published to npm;
   once it is, `node <bundle>` can be replaced with the npm package.

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

## Tools (94: 60 read-only, 31 writes, 3 that connect without a key)

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
| | `list_studies`, `get_study` | Research studies (`create_study`), their tasks and status; camera studies are `list_gaze_studies` |
| Actions | `start_ab_test` (write) | Create an A/B test as a draft; nothing reaches visitors until the owner approves the start |
| | `set_ab_test_status` (write) | Ask to conclude or archive a test; the owner approves it from the link RevealWhy returns |
| | `create_goal`, `confirm_site_goal` (write) | Configure a conversion goal; confirm, reject or rename an inferred site goal |
| | `create_study` (write) | Create a user test as a draft; nobody is invited until a project member opens it |
| Predicted & simulated | `predict_attention` (write, `run:synthetic`) | Where a visitor is likely to look, labelled Predicted (a model, not measured) |
| | `screen_variants` (write, `run:synthetic`) | A simulated check (AI walk-through) of 2 to 5 variant URLs before traffic: no rank or winner (at most 10 runs an hour per project) |
| | `start_journey_check` (write, `run:synthetic`) | Simulated agents try each journey as a sighted shopper, a keyboard and screen-reader user and an AI shopping agent; they always stop before payment (one check at a time, at most 6 an hour per project with a key) |
| | `get_journey_verdicts` (`run:synthetic`) | The latest journey check: "Blockers found", "Friction found", "No blockers found on this run" or "Stopped before payment" per journey and persona, with the fixed disclaimer |

| Eye tracking (beta, paid plans) | `get_eye_tracking_status` | Can this project run webcam eye-tracking studies, and if not, which step is missing (plan, switch, availability) |
| | `list_gaze_studies` | The project's camera studies and their camera mode (not the research studies of `list_studies`) |
| | `create_gaze_study` (write) | A study that requires the camera, for the public or the site's customers (never employees or students) |
| | `create_participant_links` (write) | One short link per participant |
| | `get_gaze_quality` | Per participant: did eye tracking run, its quality band, the device |
| | `get_gaze_metrics`, `get_gaze_heatmap` | Measured gaze per element and the page heatmap, with quality bands; abstains with a reason when there is not enough data |

### The test flow (in the app's order)

A coding agent can set up a product, plan and run a test, read the results, send problems out as tickets, write a report
and automate it, all through the same routes and guards the app uses. Everything it does shows in the app under
**Settings → Coding agents → Recent agent actions**. The owner makes the agent's key in the app and ticks what it may do:
`run:tests` and `read:findings` always, and `write:setup`, `write:accounts` and `write:tickets` each only when ticked (they are
never implied by `manage:project`, and only work while the person who made the key is still an owner).

| Step | Tool | What it does |
|---|---|---|
| 1 Your website | `add_product` (free start) | A product is made by a person; this starts a free one the person approves in the browser |
| | `get_ownership_record`, `check_ownership` | The record the owner publishes to prove the site is theirs, and a check. The agent cannot prove it for them |
| | `list_test_copies`, `add_test_copy` | Test copies of the site. Declaring one a test copy is the owner's statement in the app |
| 2 Who uses it | `list_kinds`, `add_kind`, `describe_kind`, `set_trait_card` | Kinds of user and their cards (never accessibility needs; never replacing a trait the owner set) |
| 3 Their goals | `suggest_test_goals`, `add_test_goal`, `list_test_goals`, `confirm_test_goal` | Ideas stay unticked until picked; a goal is a draft until it is confirmed (`confirm_test_goal`, which needs an owner-approved key, or the owner in the app) |
| 4 Test accounts | `make_tester`, `list_testers` | RevealWhy testers only: a RevealWhy address and an account RevealWhy makes. No password goes in or out |
| | `name_test_thing`, `list_test_things` | Things on a test copy that tests may use |
| 5 Review and run | `plan_test` | The estimate: tries, minutes, money, screen sizes, visitors, the month's spending, every refusal. Gives a `plan_id` |
| | `start_test`, `stop_test`, `get_test_progress` | `start_test` is refused without the `plan_id` and starts exactly that plan |
| | `check_preview` | A paid test of a preview address; needs a `plan_id` too |
| Results | `get_test_results`, `list_test_issues`, `get_test_issue`, `why_could_not_tell` | As honest as the app: thin results give counts only, could-not-tell is never a pass, test visitors are simulated |
| Fixing | `send_to_github`, `send_to_notion` | Preview first (what leaves RevealWhy, masked), then send with the preview's hash |
| | `mark_fix_shipped`, `retest` | A fix is deployed; test it again |
| Report | `get_test_report` | Markdown, from the same reads as the app |
| Automate | `list_schedules`, `set_schedule`, `pause_schedule` | Weekly or after a release; pausing only (starting again and removing are the owner's) |

No tool can turn on a live-site switch or a test-payment tick, confirm a goal, or take or return a password. The old
product's tools above are marked **legacy** in the catalog; they keep working. The plugin's skill `test-this-project`
drives the whole flow.

The eye-tracking tools need a key with `read:gaze` (reads) and `write:studies` (creating camera studies and
participant links). Eye tracking is a free beta on the paid plans, and a project member switches it on in **Settings → Eye
tracking**; turning it on is not something an agent can do. Gaze answers are measured, carry the server's quality band
and abstain when there is not enough data: report them that way.

The writes need a key with the `write:findings` scope as well (`predict_attention`, `screen_variants` and `start_journey_check` need
`run:synthetic`, and the two eye-tracking study writes `write:studies`, instead). A/B tests and studies an assistant creates are drafts, and changing a test's status is the
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
- **403 "lacks the required scope"**: recreate the key with both read scopes (and the write scope a write tool lists; see Security).
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

- Most tools only read. 11 tools write, and each needs a scope the key must carry:
  - `write:findings`: `report_fix` and `set_finding_status` (move a task through its lifecycle; nothing is deleted,
    and `set_finding_status open` undoes either), `start_ab_test` (creates a **draft** test), `set_ab_test_status`
    (the owner's approval to start, pause or stop a test), `create_goal`, `confirm_site_goal` and `create_study`
    (a draft study).
  - `run:synthetic`: `predict_attention` and `screen_variants` (labelled simulated runs, rate-limited).
  - `write:studies`: `create_gaze_study` and `create_participant_links`.
  Nothing an assistant creates reaches a visitor or participant until the owner starts it.
- Use scoped `rw_…` keys, which are hashed at rest and revocable. Avoid the site's tracking key: it is
  embedded in your public pages.
- Keys are never logged. All traffic goes over HTTPS to the configured API URL only.

MIT
