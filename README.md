# RevealWhy for Claude Code

**Ask Claude why your website isn't converting and get answers grounded in what your visitors actually did.**

RevealWhy watches real behaviour on your site: what people see, read, ignore and click, and where they give
up. It turns that into findings, each with its evidence, confidence and expected lift. This plugin puts all
of it inside Claude Code, so you can run a CRO audit, find the step where a funnel leaks, or read out an
A/B test without leaving your editor. You can then fix the page in the same session.

```
> /revealwhy:cro-audit
> Why are mobile visitors abandoning checkout?
> Which CTAs do people see but never click on the pricing page?
> Did my hero headline test win?
> How much of my traffic is ChatGPT and Claude browsing my site?
```

## Why it's different

- **Behaviour, not best-practice folklore.** A finding exists only if your traffic shows it. Visitors were
  measured as *exposed* to that CTA and didn't act; that step measurably loses goal-seekers. No generic
  "make the button bigger".
- **Honest about certainty.** Every finding carries its basis (proven by your A/B test › observed in your
  traffic › research principle) and a calibrated confidence. Expected lifts are labelled as research priors
  until your own tests calibrate them.
- **It closes the loop.** Findings turn into A/B tests, and a decisive, SRM-clean win promotes the finding
  to *proven*. The scoreboard shows what your changes actually earned.
- **It's built for code.** You find the problem and fix the component in one conversation.

## What's included

<!-- generated:tools -->
**37 MCP tools**: 35 read-only, 2 that write (`report_fix`, `set_finding_status`; they need a key with `write:findings` and never change your site).

| Tool | What it does | Access |
|---|---|---|
| `get_project_status` | Project status | read (`read:analytics`) |
| `get_tracking_snippet` | Tracking snippet to install | read (`read:analytics`) |
| `get_report` | Executive report | read (`read:analytics`) |
| `get_traffic` | Traffic over time | read (`read:analytics`) |
| `get_trends` | Long-range trends | read (`read:analytics`) |
| `get_agent_traffic` | AI agent & bot traffic report | read (`read:analytics`) |
| `get_top_pages` | Top pages | read (`read:analytics`) |
| `list_pages` | Analyzed pages | read (`read:analytics`) |
| `analyze_dropoff` | Drop-off analysis | read (`read:analytics`) |
| `get_journey_analytics` | Journey analytics | read (`read:analytics`) |
| `get_visitor_journeys` | Returning-visitor journeys | read (`read:analytics`) |
| `get_top_elements` | Top elements on a page | read (`read:analytics`) |
| `get_element_performance` | Element performance | read (`read:analytics`) |
| `get_content_performance` | Content performance | read (`read:analytics`) |
| `get_attention_calibration` | Attention calibration | read (`read:findings`) |
| `list_conversion_goals` | Conversion goals | read (`read:analytics`) |
| `get_conversion_stats` | Conversion stats | read (`read:analytics`) |
| `list_conversion_events` | Conversion events | read (`read:analytics`) |
| `list_goals` | Goals with performance | read (`read:findings`) |
| `get_goal_journey` | Journey to a goal | read (`read:findings`) |
| `suggest_goals` | Suggested goals | read (`read:findings`) |
| `list_findings` | Findings | read (`read:findings`) |
| `get_finding` | Finding | read (`read:findings`) |
| `get_finding_evidence` | Finding evidence | read (`read:findings`) |
| `get_progress` | Findings progress | read (`read:findings`) |
| `get_audience` | Audience segments | read (`read:findings`) |
| `get_site_graph` | Site graph | read (`read:findings`) |
| `list_template_groups` | Page template groups | read (`read:findings`) |
| `list_experiments` | Experiments | read (`read:findings`) |
| `get_experiment_verdict` | Experiment verdict | read (`read:findings`) |
| `get_scoreboard` | Scoreboard | read (`read:findings`) |
| `list_improvements` | Improvements | read (`read:findings`) |
| `get_autopilot` | Autopilot readiness | read (`read:findings`) |
| `list_agent_tasks` | Agent tasks | read (`read:findings`) |
| `get_agent_task` | Agent task | read (`read:findings`) |
| `report_fix` | Report a fix | **writes** (`write:findings`) |
| `set_finding_status` | Set task status | **writes** (`write:findings`) |
<!-- /generated:tools -->

<!-- generated:skills -->
**7 skills.** Claude uses these automatically, or you can invoke them by name:

| Skill | For |
|---|---|
| `ab-test-readout` | Read out A/B test and experiment results correctly — winner, loser or inconclusive, lift, sample ratio mismatch (SRM) and whether it's safe to call — plus the cumulative impact scoreboard. |
| `ai-agent-traffic` | Measure how AI assistants and bots (ChatGPT, Claude, Perplexity, Gemini agents, crawlers) visit and read your website versus humans — volume, trend and which pages they read — for AI visibility / GEO (generative engine optimization). |
| `cro-audit` | Full website conversion (CRO) audit grounded in real visitor behaviour — KPIs, where visitors drop off, ignored CTAs, unread content, and a ranked fix list with evidence, confidence and expected lift. |
| `cta-attention-audit` | Find call-to-action buttons visitors actually SEE but don't click, using measured exposure and attention (not guesswork heatmaps), with a cited expected lift and prerequisite checks. |
| `funnel-conformance` | Find the exact funnel step where visitors are lost — abandon vs detour — ranked by recoverable conversions, from real journeys on your site. |
| `revealwhy-install` | Install RevealWhy analytics into the codebase you are working in: detect the framework and the existing cookie-consent setup, add one consent-gated loader module, wire 3–8 key product events, document it in CLAUDE.md, and verify. |
| `revealwhy-setup` | Set up or troubleshoot the RevealWhy plugin connection: create a scoped API key, configure REVEALWHY_API_KEY and REVEALWHY_PROJECT_ID, verify the connection and the tracking snippet. |
<!-- /generated:skills -->

**4 guided prompts** run as slash commands from the MCP server: `site_audit`, `why_not_converting`,
`experiment_review` and `ai_traffic_report`.

## Install

Inside Claude Code:

```
/plugin marketplace add RevealWhyApp/revealwhy-claude-plugin
/plugin install revealwhy@revealwhy
```

Claude Code asks for two settings during install:

- **API key**: in RevealWhy, open Settings → Developers → Secret API keys and create a key with scopes `read:analytics`
  and `read:findings` (add `write:findings` to let Claude report fixes). In RevealWhy, "Make a read-only key for
  my AI assistant" picks the two read scopes for you. Claude Code stores it in its secure credential store.
- **Project ID** (optional): the default project for every tool.

Then ask *"Is RevealWhy working on my site?"* To change the settings later, run
`/plugin configure revealwhy@revealwhy`.

You need Node.js 18 or later; the MCP server ships inside the plugin, so nothing else is installed. You also need a
RevealWhy project with the tracking snippet installed. Get one at [revealwhy.com](https://revealwhy.com).

**Without the plugin** (MCP server only, any MCP client): clone this repo and point your client at the
bundled server:

```bash
claude mcp add revealwhy --env REVEALWHY_API_KEY=rw_... --env REVEALWHY_PROJECT_ID=... -- node /path/to/revealwhy-claude-plugin/plugins/revealwhy/server/revealwhy-mcp.mjs
```

## Privacy & safety

- **Almost all read-only.** 35 of the 37 tools only read. Two write, and only with a `write:findings` key:
  `set_finding_status` (e.g. "I'm working on this one") and `report_fix` ("I changed the site"). A reported fix
  waits for the owner to confirm it in RevealWhy before anything is checked. No tool can change your site,
  start or stop an experiment, or change your settings.
- **Scoped keys.** Use a `rw_…` key limited to analytics and findings for one project. It is stored hashed
  and you can revoke it at any time.
- **One destination.** The MCP server only talks to the RevealWhy API. Results go to Claude only for the
  tools Claude calls, and each result is capped in size.

## Configuration

The plugin sets the API key and project ID from its install settings. For the standalone server, these
environment variables apply:

| Variable | Required | Default |
|---|---|---|
| `REVEALWHY_API_KEY` | yes | — |
| `REVEALWHY_PROJECT_ID` | recommended | — (otherwise pass `projectId` per call) |
| `REVEALWHY_API_URL` | self-hosted only | `https://api.revealwhy.com` |
| `REVEALWHY_MAX_RESPONSE_CHARS` | no | `60000` |

## Roadmap

Write actions are planned, gated by write-scoped keys: draft a test from a finding, create goals
and funnels, and launch user-testing studies and synthetic-visitor runs. Until then, use the RevealWhy
dashboard for those. An API key can only ever create a test as a draft: starting, stopping, concluding or
archiving one needs the project owner's approval, so the API answers `403 owner_confirm_required` with an
`approveUrl` the owner opens to confirm.

MIT licensed · [revealwhy.com](https://revealwhy.com)
