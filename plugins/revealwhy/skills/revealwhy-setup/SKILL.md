---
name: revealwhy-setup
description: "Set up or troubleshoot the RevealWhy plugin: create a scoped API key, configure REVEALWHY_API_KEY and REVEALWHY_PROJECT_ID, verify the connection and the tracking snippet. Use when: RevealWhy not working, 401 or 403 from RevealWhy, connect RevealWhy, install tracking, no data yet, which project ID."
---

# RevealWhy setup

## 1. Account and tracking

RevealWhy needs its tracking snippet on the user's site before any tool returns data. If they don't have
an account, send them to https://revealwhy.com to create a project and install the snippet (one script tag,
or the Shopify / Webflow / WordPress integrations).

## 2. Scoped API key

In RevealWhy: **Project settings → API keys → Create key**, scopes **read:analytics** and **read:findings**.
The key starts with `rw_` and is shown once. Prefer this over the site's tracking key, which is public.

Never ask the user to paste the key into the chat; transcripts persist.

- **Plugin users:** Claude Code asked for the key and project ID at install. To change them, run
  `/plugin configure revealwhy@revealwhy`. The key is kept in Claude Code's secure credential store.
- **Standalone MCP server:** set the values in the shell profile or MCP config, never in chat:

```bash
export REVEALWHY_API_KEY="rw_..."
export REVEALWHY_PROJECT_ID="..."   # Project settings → General
```

Restart Claude Code after changing either.

## 3. Verify

Call `get_project_status`.
- `401` → key missing, mistyped or revoked.
- `403 … lacks the required scope` → recreate the key with both read scopes.
- `403 Access denied to this project` → the key belongs to a different project than REVEALWHY_PROJECT_ID.
- Healthy status but zero sessions → snippet not installed or no traffic yet; data appears within minutes
  of the first visit, findings after enough sessions are processed.

Self-hosted RevealWhy: also set `REVEALWHY_API_URL` (default `https://api.revealwhy.com`).
