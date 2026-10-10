#!/usr/bin/env node
/**
 * RevealWhy MCP Server
 *
 * Exposes RevealWhy's behavioural analytics, grounded findings and experiment results to Claude
 * Code / Claude Desktop / any MCP client over stdio. Every tool is a typed, read-only decoder over
 * a real RevealWhy API route (see catalog.ts); the server never invents data — the honesty contract
 * (basis, confidence, priors-not-promises) is carried through verbatim from the API payloads.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { TOOLS, isWriteTool, type ToolDef } from "./catalog.js";

export const VERSION = "2.2.1";

// Environment — REVEALWHY_* is preferred; legacy INSIGHTFLOW_* names still work as a fallback.
// An unset optional plugin setting can arrive blank or as a literal, unexpanded "${user_config.x}" — treat both as unset.
const clean = (v: string | undefined) => (v && v.trim() && !/^\$\{.*\}$/.test(v.trim()) ? v.trim() : undefined);
const env = (name: string) => clean(process.env[`REVEALWHY_${name}`]) || clean(process.env[`INSIGHTFLOW_${name}`]);
const API_KEY = env("API_KEY");
const API_URL = (env("API_URL") || "https://api.revealwhy.com").replace(/\/+$/, "");
const DEFAULT_PROJECT_ID = env("PROJECT_ID");
// Fixture mode: serve the findings tools from a local JSON file instead of the HTTP API — for smoke
// tests and demos without a backend. Any `_oracle` ground-truth block is stripped before serving.
const FINDINGS_FIXTURE = env("FINDINGS_FIXTURE");
/** Tool results larger than this are truncated (with a note) so one call can't flood the context. */
const MAX_CHARS = Number(env("MAX_RESPONSE_CHARS")) || 60_000;

const SETUP_HINT =
  "Set REVEALWHY_API_KEY to a scoped key (RevealWhy → Settings → Developers → Secret API keys, scopes read:analytics + read:findings; add write:findings for report_fix / set_finding_status) " +
  "and REVEALWHY_PROJECT_ID to your project ID, then restart Claude Code.";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) });

function cap(s: string): string {
  if (s.length <= MAX_CHARS) return s;
  return `${s.slice(0, MAX_CHARS)}\n\n…[truncated ${s.length - MAX_CHARS} characters — narrow the query (filters, limit, date range) for the rest]`;
}

/** Map an HTTP failure to an actionable message instead of a raw status dump. */
function explainHttpError(status: number, body: string, scope: string): string {
  let detail = body;
  try {
    detail = JSON.parse(body)?.error ?? body;
  } catch {
    /* plain-text body */
  }
  if (status === 401) return `RevealWhy rejected the API key (401: ${detail}). ${SETUP_HINT}`;
  if (status === 403)
    return `Access denied (403: ${detail}). The key must belong to this project and carry the "${scope}" scope — create one under Settings → Developers → Secret API keys.`;
  if (status === 404) return `Not found (404: ${detail}). Check the project ID and any IDs passed to this tool.`;
  if (status === 429) return `Rate limited by RevealWhy (429). Wait a moment and retry.`;
  return `RevealWhy API error ${status}: ${String(detail).slice(0, 500)}`;
}

async function apiCall(
  path: string,
  scope: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        "X-API-Key": API_KEY!,
        Accept: "application/json",
        "User-Agent": `revealwhy-mcp/${VERSION}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e: any) {
    return { ok: false, error: `Could not reach the RevealWhy API at ${API_URL} (${e?.message ?? e}).` };
  }
  const payload = await res.text();
  if (!res.ok) return { ok: false, error: explainHttpError(res.status, payload, scope) };
  try {
    return { ok: true, data: JSON.parse(payload) };
  } catch {
    return { ok: true, data: payload };
  }
}

// ── Fixture mode (findings tools only) ───────────────────────────────────────────────────────────
let _fixture: any[] | null = null;
function fixtureFindings(): any[] {
  if (_fixture) return _fixture;
  const raw = JSON.parse(readFileSync(FINDINGS_FIXTURE!, "utf8"));
  const arr: any[] = Array.isArray(raw) ? raw : raw.findings ?? [];
  _fixture = arr.map(({ _oracle, ...f }) => f); // never leak ground truth
  return _fixture;
}
const findingIdOf = (f: any) => f.finding_id ?? f.findingId ?? f.id;
const tally = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});

function fromFixture(name: string, args: Record<string, any>): unknown | undefined {
  if (!FINDINGS_FIXTURE) return undefined;
  const all = fixtureFindings();
  switch (name) {
    case "list_findings": {
      const findings = all.filter((f) => (!args.status || f.status === args.status) && (!args.pageKeyId || f.pageKeyId === args.pageKeyId));
      return { findings, count: findings.length };
    }
    case "get_finding":
      return { finding: all.find((f) => findingIdOf(f) === args.findingId) ?? null };
    case "get_progress": {
      const byBasis = tally(all.map((f) => f.basis));
      return { total: all.length, byStatus: tally(all.map((f) => f.status)), byBasis, proven: byBasis.proven || 0 };
    }
    default:
      return undefined;
  }
}

// ── Server ───────────────────────────────────────────────────────────────────────────────────────
const server = new McpServer(
  { name: "revealwhy", title: "RevealWhy", version: VERSION },
  {
    instructions:
      "RevealWhy explains WHY visitors don't convert, grounded in real on-site behaviour. Start with get_project_status or get_report; " +
      "use list_findings for what to fix. projectId is optional when REVEALWHY_PROJECT_ID is set. Honesty rules: always state a finding's " +
      "basis and confidence; an expectedLift with basis 'prior' is research, not a promise; surface unmet/unknown prerequisiteChecks. " +
      "To fix the site: list_agent_tasks, set_finding_status sent_to_agent when you take one, and report_fix after the change is deployed " +
      "(writes need a write:findings key). Never describe a fix as working until its status is verified.",
  },
);

const projectIdInput = z
  .string()
  .min(1)
  .optional()
  .describe(DEFAULT_PROJECT_ID ? "Project ID (defaults to the configured project)" : "Project ID (required unless REVEALWHY_PROJECT_ID is set)");

async function runTool(def: ToolDef, args: Record<string, any>): Promise<ToolResult> {
  const fixture = fromFixture(def.name, args);
  if (fixture !== undefined) return text(cap(JSON.stringify(fixture, null, 2)));
  if (!API_KEY) return text(`RevealWhy is not configured: REVEALWHY_API_KEY is not set. ${SETUP_HINT}`, true);
  const projectId = args.projectId || DEFAULT_PROJECT_ID;
  if (!projectId) return text(`No project selected: pass projectId or set REVEALWHY_PROJECT_ID. ${SETUP_HINT}`, true);
  const r = await apiCall(def.path(projectId, args), def.scope, def.method ?? "GET", def.body?.(args));
  if (!r.ok) return text(r.error, true);
  const out = def.render ? def.render(r.data) : typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2);
  return text(cap(out));
}

for (const def of TOOLS) {
  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: { projectId: projectIdInput, ...def.input },
      annotations: isWriteTool(def)
        ? // writes only move a task through its lifecycle; each is undoable (set_finding_status open), none deletes
          { title: def.title, readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
        : { title: def.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args: Record<string, any>) => {
      try {
        return await runTool(def, args);
      } catch (e: any) {
        return text(`Error: ${e?.message ?? e}`, true);
      }
    },
  );
}

// ── Prompts: guided workflows that show up as slash commands in Claude Code ─────────────────────
const prompt = (name: string, title: string, description: string, body: (a: Record<string, string | undefined>) => string, argsSchema: Record<string, z.ZodOptional<z.ZodString>> = {}) =>
  server.registerPrompt(name, { title, description, argsSchema }, (a: Record<string, string | undefined>) => ({
    messages: [{ role: "user", content: { type: "text", text: body(a) } }],
  }));

const HONESTY =
  "For every finding, state its basis and confidence; phrase expectedLift with basis 'prior' as 'comparable changes lift … in testing', never as a promise; call out unmet/unknown prerequisiteChecks. Never invent a finding.";

prompt(
  "site_audit",
  "Website conversion audit",
  "A full, evidence-grounded CRO audit of your site: health, KPIs, top findings ranked by recoverable conversions, and next steps.",
  () =>
    `Run a RevealWhy conversion audit. 1) get_project_status — if tracking is not healthy, stop and explain how to fix it. 2) get_report for KPIs. 3) list_findings (status suggested) and rank by people lost. 4) analyze_dropoff for the biggest leaks. 5) Summarise the top 5 fixes as a table (page, change, why, basis, confidence, expected lift). ${HONESTY}`,
);
prompt(
  "why_not_converting",
  "Why aren't visitors converting?",
  "Localise where goal-seekers are lost and why, for one goal or page.",
  (a) =>
    `Find why visitors are not converting${a.focus ? ` on ${a.focus}` : ""}. Use list_goals, then get_goal_journey for the main goal, analyze_dropoff, and list_findings for the losing step. Explain the mechanism and the evidence. ${HONESTY}`,
  { focus: z.string().optional().describe("A page URL or goal name to focus on") },
);
prompt(
  "experiment_review",
  "Review my A/B tests",
  "Which experiments won, lost, or need more traffic — with SRM checks.",
  () =>
    `Review the site's experiments: list_experiments, then get_experiment_verdict for each running or recently concluded one. Report winner/loser/inconclusive, lift, sample size and any SRM warning; then get_scoreboard for cumulative impact. Do not call a test before its verdict says so.`,
);
prompt(
  "ai_traffic_report",
  "AI agent traffic report",
  "How AI assistants and crawlers read your site, versus humans.",
  () => `Use get_agent_traffic and get_traffic (trafficClass human vs ai_agent) to report how much traffic comes from AI agents, which pages they read, and the trend. Suggest what to improve for AI visibility, clearly separating evidence from opinion.`,
);

async function main() {
  if (!API_KEY && !FINDINGS_FIXTURE) {
    // Don't exit: Claude Code shows a failed server as broken. Start, and let each tool explain setup.
    console.error(`[revealwhy-mcp] REVEALWHY_API_KEY is not set — tools will return setup instructions. ${SETUP_HINT}`);
  }
  await server.connect(new StdioServerTransport());
  console.error(`[revealwhy-mcp] v${VERSION} running on stdio (${TOOLS.length} tools, API ${API_URL})`);
}

main().catch((error) => {
  console.error("[revealwhy-mcp] fatal:", error);
  process.exit(1);
});
