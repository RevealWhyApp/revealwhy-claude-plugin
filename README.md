# RevealWhy for Claude Code

**Test your website with test visitors, read what went wrong, and send the problems to GitHub or Notion, all from Claude Code.**

RevealWhy sends test visitors through your website, each with their own goal, and tells you where they got stuck.
This plugin connects Claude Code to RevealWhy through MCP, so you can do the whole job in one conversation:

1. **Set up your website.** Prove the site is yours, add a test copy, and say who your visitors are and what they want.
2. **Test it with test visitors.** Plan a test, see the estimate, run it, or check a preview of a change.
3. **Read the results.** See which goals worked, which were blocked, and why.
4. **Send tickets.** Turn each problem into a GitHub issue or a Notion page.
5. **Get a report.** Fix the problems, test again, and keep a schedule.

```
> /revealwhy:test-this-project
> Set up my website for testing
> Run a test on the checkout and tell me what blocked the visitors
> Send the blocked problems to GitHub
> Write me the test report
```

## Install

Inside Claude Code:

```
/plugin marketplace add RevealWhyApp/revealwhy-claude-plugin
/plugin install revealwhy@revealwhy
```

Claude Code asks for two settings during install:

- **API key**: in RevealWhy, open Keys (`https://my.revealwhy.com/p/<product id>/keys`) and create a key. Give it the scopes for
  what you want Claude to do (the tables below show the scope each tool needs). Claude Code keeps it in its secure
  credential store.
- **Project ID** (optional): the default project for every tool.

**No RevealWhy account yet?** Leave both settings empty and ask Claude to *"start RevealWhy free"*. It gives you a
link and a short code. Sign up or sign in, check that the code matches, and approve. Claude then connects with a
read-only key to your free project and keeps it for the next session in `~/.config/revealwhy/credentials.json`
(readable only by you). A key you configure always takes precedence.

You need Node.js 18 or later. The MCP server ships inside the plugin, so nothing else is installed. Get a RevealWhy
account at [revealwhy.com](https://revealwhy.com).

**Without the plugin** (MCP server only, any MCP client): clone this repo and point your client at the bundled server:

```bash
claude mcp add revealwhy --env REVEALWHY_API_KEY=rw_... --env REVEALWHY_PROJECT_ID=... -- node /path/to/revealwhy-claude-plugin/plugins/revealwhy/server/revealwhy-mcp.mjs
```

## Check a pull request's preview

The `preview-check/` folder is a GitHub Action that asks RevealWhy to test a pull request's preview and posts the
result on the pull request. See [preview-check/README.md](preview-check/README.md).

## What's included

<!-- generated:tools -->
**94 MCP tools.** The tools for the test flow come first; legacy tools are at the end. Tools marked *writes* need a
key with the scope shown and never change your website. Starting or stopping a test can need the project owner's approval. Three tools connect a new session without a key
(`start_free`, `start_free_status`, `add_product`).

### Connect

Start without a key: the person approves in the browser.

| Tool | What it does | Access |
|---|---|---|
| `start_free` | Start RevealWhy free | connects (no key needed) |
| `start_free_status` | Finish starting free | connects (no key needed) |
| `add_product` | Add a product (free start) | connects (no key needed) |

### 1. Set up your website

Prove the site is yours, add a test copy, describe the kinds of visitor and their goals.

| Tool | What it does | Access |
|---|---|---|
| `get_ownership_record` | Ownership record for the site | read (`read:findings`) |
| `check_ownership` | Check the ownership record | writes (`run:tests`) |
| `list_test_copies` | Test copies of the site | read (`write:setup`) |
| `add_test_copy` | Add a test copy | writes (`write:setup`) |
| `list_kinds` | Kinds of user | read (`read:findings`) |
| `add_kind` | Add a kind of user | writes (`write:setup`) |
| `describe_kind` | Describe a kind of user | writes (`write:setup`) |
| `set_trait_card` | Set a trait on a kind's card | writes (`write:setup`) |
| `suggest_test_goals` | Suggest goals for a kind of user | writes (`write:setup`) |
| `add_test_goal` | Add a goal | writes (`write:setup`) |
| `list_test_goals` | Goals of the product | read (`write:setup`) |
| `confirm_test_goal` | Confirm a goal's steps | writes (`write:confirm`) |
| `make_tester` | Make a RevealWhy tester | writes (`write:accounts`) |
| `list_testers` | RevealWhy testers | read (`write:accounts`) |
| `name_test_thing` | Name things on a test copy | writes (`write:setup`) |
| `list_test_things` | Named things on a test copy | read (`write:setup`) |

### 2. Test it with test visitors

Plan a test, read the estimate, run it, and check a preview of a change.

| Tool | What it does | Access |
|---|---|---|
| `plan_test` | Plan a test: read the estimate | read (`run:tests`) |
| `start_test` | Start the test | writes (`run:tests`) |
| `stop_test` | Stop a test | writes (`run:tests`) |
| `get_test_progress` | Test progress | read (`read:findings`) |
| `check_preview` | Test a preview of the site | writes (`run:tests`) |

### 3. Read the results

| Tool | What it does | Access |
|---|---|---|
| `get_test_results` | Test results | read (`read:findings`) |
| `list_test_issues` | Problems found | read (`read:findings`) |
| `get_test_issue` | One problem found | read (`read:findings`) |
| `why_could_not_tell` | Why a goal could not be told | read (`read:findings`) |

### 4. Send tickets, fix, test again

| Tool | What it does | Access |
|---|---|---|
| `send_to_github` | Send a problem to GitHub | writes (`write:tickets`) |
| `send_to_notion` | Send a problem to Notion | writes (`write:tickets`) |
| `mark_fix_shipped` | Report that a fix is shipped | writes (`write:fix_shipped`) |
| `retest` | Test the fixed problems again | writes (`run:tests`) |

### 5. Get a report and keep testing

| Tool | What it does | Access |
|---|---|---|
| `get_test_report` | Test report (markdown) | read (`read:findings`) |
| `list_schedules` | Test schedules | read (`read:findings`) |
| `set_schedule` | Set a test schedule | writes (`write:setup`) |
| `pause_schedule` | Pause a test schedule | writes (`write:setup`) |

### Findings and fixes

Findings grounded in what real visitors did, and the tasks to fix them.

| Tool | What it does | Access |
|---|---|---|
| `list_findings` | Findings | read (`read:findings`) |
| `get_finding` | Finding | read (`read:findings`) |
| `get_finding_evidence` | Finding evidence | read (`read:findings`) |
| `list_agent_tasks` | Agent tasks | read (`read:findings`) |
| `get_agent_task` | Agent task | read (`read:findings`) |
| `report_fix` | Report a fix | writes (`write:findings`) |
| `set_finding_status` | Set task status | writes (`write:findings`) |

### Legacy tools

These belong to RevealWhy's earlier analytics product. They keep working, and their descriptions say "legacy".
For new work, use the tools above.

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
| `get_progress` | Findings progress | read (`read:findings`) |
| `get_audience` | Audience segments | read (`read:findings`) |
| `get_site_graph` | Site graph | read (`read:findings`) |
| `list_template_groups` | Page template groups | read (`read:findings`) |
| `list_experiments` | Experiments | read (`read:findings`) |
| `get_experiment_verdict` | Experiment verdict | read (`read:findings`) |
| `get_scoreboard` | Scoreboard | read (`read:findings`) |
| `list_improvements` | Improvements | read (`read:findings`) |
| `get_autopilot` | Autopilot readiness | read (`read:findings`) |
| `start_ab_test` | Create an A/B test (draft) | writes (`write:findings`) |
| `set_ab_test_status` | Ask the owner to conclude or archive an A/B test | writes (`write:findings`) |
| `create_goal` | Create a conversion goal | writes (`write:findings`) |
| `list_site_goals` | Site goals | read (`read:findings`) |
| `confirm_site_goal` | Confirm a site goal | writes (`write:findings`) |
| `get_heatmap` | Page heatmap | read (`read:analytics`) |
| `get_replay_link` | Session replay link | read (`read:analytics`) |
| `predict_attention` | Predicted attention for a page | writes (`run:synthetic`) |
| `screen_variants` | Screen variants before traffic | writes (`run:synthetic`) |
| `start_journey_check` | Start a journey check | writes (`run:synthetic`) |
| `get_journey_verdicts` | Journey check verdicts | read (`run:synthetic`) |
| `create_study` | Create a user test (draft) | writes (`write:findings`) |
| `list_studies` | User tests | read (`read:findings`) |
| `get_study` | One user test | read (`read:findings`) |
| `get_eye_tracking_status` | Eye tracking (beta, paid plans): status | read (`read:gaze`) |
| `list_gaze_studies` | Eye tracking (beta, paid plans): camera studies | read (`read:gaze`) |
| `create_gaze_study` | Eye tracking (beta, paid plans): create a study | writes (`write:studies`) |
| `create_participant_links` | Participant links | writes (`write:studies`) |
| `get_gaze_quality` | Eye tracking (beta, paid plans): quality per participant | read (`read:gaze`) |
| `get_gaze_metrics` | Eye tracking (beta, paid plans): element table for a page | read (`read:gaze`) |
| `get_gaze_heatmap` | Eye tracking (beta, paid plans): heatmap for a page | read (`read:gaze`) |
<!-- /generated:tools -->

<!-- generated:skills -->
**9 skills.** Claude uses these automatically, or you can invoke them by name. The first one drives the test flow;
the others are for the earlier analytics product.

| Skill | For |
|---|---|
| `test-this-project` | Test this project with RevealWhy: drive the whole test flow from here, in the app's order: set up the product, plan and run a test with simulated visitors, read the results, turn problems into GitHub or Notion tickets, report fixes, re-test, write a report and set a schedule. |
| `ab-test-readout` | Read out A/B test and experiment results correctly — winner, loser or inconclusive, lift, sample ratio mismatch (SRM) and whether it's safe to call — plus the cumulative impact scoreboard. |
| `ai-agent-traffic` | Measure how AI assistants and bots (ChatGPT, Claude, Perplexity, Gemini agents, crawlers) visit and read your website versus humans — volume, trend and which pages they read — for AI visibility / GEO (generative engine optimization). |
| `cro-audit` | Full website conversion (CRO) audit grounded in real visitor behaviour — KPIs, where visitors drop off, ignored CTAs, unread content, and a ranked fix list with evidence, confidence and expected lift. |
| `cta-attention-audit` | Find call-to-action buttons visitors actually SEE but don't click, using measured exposure and attention (not guesswork heatmaps), with a cited expected lift and prerequisite checks. |
| `eye-tracking-study` | Run a webcam eye-tracking study on a page with Eye tracking (beta, paid plans): set it up, get one participant link per person, then read measured gaze back with its quality bands. |
| `funnel-conformance` | Find the exact funnel step where visitors are lost — abandon vs detour — ranked by recoverable conversions, from real journeys on your site. |
| `revealwhy-install` | Install RevealWhy analytics into the codebase you are working in: detect the framework and the existing cookie-consent setup, add one consent-gated loader module, wire 3–8 key product events, document it in CLAUDE.md, and verify. |
| `revealwhy-setup` | Set up or troubleshoot the RevealWhy plugin connection: start free from the conversation (start_free), or create a scoped API key, configure REVEALWHY_API_KEY and REVEALWHY_PROJECT_ID, verify the connection and the tracking snippet. |
<!-- /generated:skills -->

**4 guided prompts** run as slash commands from the MCP server: `site_audit`, `why_not_converting`,
`experiment_review` and `ai_traffic_report`.

## Privacy and safety

- **Reads by default; writes only with the right scope.** A key with a write scope lets Claude set up a test, run
  one, and send tickets. A test or study it creates stays a draft, and starting, stopping, concluding or archiving
  one needs the project owner's approval: the API answers `403 owner_confirm_required` with an `approveUrl` the owner
  opens to confirm. No tool changes your website.
- **Test visitors are simulated.** Results from them are labelled as simulated, never as measured visitor behaviour.
- **Scoped keys.** Use a `rw_...` key limited to what you need, for one project. It is stored hashed and you can
  revoke it at any time.
- **One destination.** The MCP server only talks to the RevealWhy API. Results go to Claude only for the tools Claude
  calls, and each result is capped in size.

## Configuration

The plugin sets the API key and project ID from its install settings. For the standalone server, these environment
variables apply:

| Variable | Required | Default |
|---|---|---|
| `REVEALWHY_API_KEY` | yes, unless you start free (`start_free`) | none |
| `REVEALWHY_PROJECT_ID` | recommended | none (otherwise pass `projectId` per call) |
| `REVEALWHY_API_URL` | self-hosted only | `https://beta.revealwhy.com` |
| `REVEALWHY_MAX_RESPONSE_CHARS` | no | `60000` |

MIT licensed · [revealwhy.com](https://revealwhy.com)
