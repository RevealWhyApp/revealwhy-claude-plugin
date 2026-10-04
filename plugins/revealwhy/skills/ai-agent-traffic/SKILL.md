---
name: ai-agent-traffic
description: "Measure how AI assistants and bots (ChatGPT, Claude, Perplexity, Gemini agents, crawlers) visit and read your website versus humans — volume, trend and which pages they read — for AI visibility / GEO (generative engine optimization). Use when: are AI agents visiting my site, AI traffic, bot traffic, LLM crawlers, GEO, AI search visibility, agentic browsing."
---

# AI agent traffic

RevealWhy classifies every session as `human`, `ai_agent` or `crawler`. This skill turns that into an AI
visibility read-out.

## Workflow

1. `get_agent_traffic` (windowDays 30) — share of traffic by class, agent breakdown, pages agents read,
   trend.
2. `get_traffic` twice (days 30): `trafficClass: "human"` and `trafficClass: "ai_agent"` for the daily
   comparison.
3. `get_top_pages` to compare what humans read with what agents read: pages agents read heavily but
   humans don't (or vice versa) are the interesting gaps.

## Output

- Headline: agent share of traffic and the trend.
- Which agents, which pages.
- 3 suggestions to improve how AI assistants read the site (structured content, crawlable key pages,
  clear product facts). Label these as **recommendations**, separate from the measured evidence.

Agent classification is heuristic: report it as "classified as", not certainty.
