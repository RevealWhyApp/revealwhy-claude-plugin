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

**31 read-only MCP tools** cover these areas:

| Area | Tools |
|---|---|
| Overview | `get_project_status`, `get_report`, `get_traffic`, `get_agent_traffic` |
| Pages & journeys | `get_top_pages`, `list_pages`, `analyze_dropoff`, `get_journey_analytics`, `get_visitor_journeys` |
| Attention & content | `get_top_elements`, `get_element_performance`, `get_content_performance`, `get_attention_calibration` |
| Conversions & goals | `list_conversion_goals`, `get_conversion_stats`, `list_conversion_events`, `list_goals`, `get_goal_journey`, `suggest_goals` |
| Findings | `list_findings`, `get_finding`, `get_finding_evidence`, `get_progress`, `get_audience`, `get_site_graph`, `list_template_groups` |
| Experiments | `list_experiments`, `get_experiment_verdict`, `get_scoreboard`, `list_improvements`, `get_autopilot` |

**6 skills.** Claude uses these automatically, or you can invoke them by name:

| Skill | For |
|---|---|
| `cro-audit` | "Why isn't my site converting?" Gives a full audit with a ranked fix list |
| `cta-attention-audit` | Finds CTAs visitors see but don't click |
| `funnel-conformance` | Finds the funnel step that loses people, and whether they abandon or detour |
| `ab-test-readout` | Reports winner / loser / inconclusive, with SRM checks |
| `ai-agent-traffic` | Shows how AI assistants and crawlers read your site (GEO) |
| `revealwhy-setup` | Connects the plugin or troubleshoots the connection |

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
  and `read:findings`. Claude Code stores it in its secure credential store.
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

- **Read-only.** No tool can change your site, your experiments or your settings.
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

Write actions are planned, gated by write-scoped keys: start or conclude a test from a finding, create goals
and funnels, and launch user-testing studies and synthetic-visitor runs. Until then, use the RevealWhy
dashboard for those.

MIT licensed · [revealwhy.com](https://revealwhy.com)
