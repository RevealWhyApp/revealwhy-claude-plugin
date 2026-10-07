---
name: revealwhy-setup
description: "Set up or troubleshoot the RevealWhy plugin connection: create a scoped API key, configure REVEALWHY_API_KEY and REVEALWHY_PROJECT_ID, verify the connection and the tracking snippet. Use when: RevealWhy not working, 401 or 403 from RevealWhy, connect RevealWhy, install tracking, no data yet, which project ID."
---

# RevealWhy setup

## 1. Account and tracking

RevealWhy needs its tracking snippet on the user's site before any tool returns data. If the site's code is in
this workspace, install it yourself with the `revealwhy-install` skill. Otherwise send them to
https://app.revealwhy.com to create a project and copy the snippet from **Settings → Tracking code** (or use the
Shopify / Webflow / WordPress connections under **Settings → Connections**).

## 2. Scoped API key

In RevealWhy: **Settings → Developers → Secret API keys → Create key**, scopes **read:analytics** and **read:findings**.
The key starts with `rw_` and is shown once. Prefer this over the site's tracking key, which is public.

Never ask the user to paste the key into the chat; transcripts persist.

- **Plugin users:** Claude Code asked for the key and project ID at install. To change them, run
  `/plugin configure revealwhy@revealwhy`. The key is kept in Claude Code's secure credential store.
- **Standalone MCP server:** set the values in the shell profile or MCP config, never in chat:

```bash
export REVEALWHY_API_KEY="rw_..."
export REVEALWHY_PROJECT_ID="..."   # Settings → Tracking code → Project ID
```

Restart Claude Code after changing either.

## 3. Verify

Call `get_project_status`.
- `401` → key missing, mistyped or revoked.
- `403 … lacks the required scope` → recreate the key with both read scopes.
- `403 Access denied to this project` → the key belongs to a different project than REVEALWHY_PROJECT_ID.
- Healthy status but zero sessions → ask the user to open their live site with `?rw_debug=1` at the end of the
  address. A badge on the page names the reason: waiting for the consent call, the browser's privacy signal
  (Brave / DuckDuckGo send Global Privacy Control by default), an origin the project does not allow, or a wrong
  key. Visits show within a minute; pages and heatmaps ~30 min after a visit ends; findings after ~10 visits.

Self-hosted RevealWhy: also set `REVEALWHY_API_URL` (default `https://api.revealwhy.com`).
