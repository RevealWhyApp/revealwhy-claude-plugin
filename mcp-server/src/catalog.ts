/**
 * The RevealWhy MCP tool catalog — one entry per tool, each a thin, typed decoder over a REAL
 * API route that a scoped `rw_…` key can authenticate (projectReadAccess / dashboardReadAccess on
 * the server). Never add a tool here for a route a scoped key cannot reach: it would only ever 401.
 *
 * Every tool is read-only today. Write scopes (start/conclude a test, create goals/studies, …) are a
 * product/security decision that has not shipped; see README "Roadmap".
 */
import { z, type ZodRawShape } from "zod";

export type Scope = "read:analytics" | "read:findings";

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  /** Extra inputs beyond the implicit `projectId`. */
  input: ZodRawShape;
  /** Build the request path (with query string) from the parsed args + resolved projectId. */
  path: (projectId: string, args: Record<string, any>) => string;
  /** Optional human-readable renderer; default is pretty JSON. */
  render?: (data: any) => string;
}

const enc = encodeURIComponent;

/** `?a=1&b=2` from the defined entries only. */
export function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    p.append(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

const date = (what: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}/, "YYYY-MM-DD").optional().describe(what);
const findingStatus = z
  .enum(["suggested", "measuring", "verdict", "applied", "dismissed"])
  .optional()
  .describe("Filter by lifecycle status");

export const TOOLS: ToolDef[] = [
  // ── Overview ─────────────────────────────────────────────────────────────────────────────────
  {
    name: "get_project_status",
    title: "Project status",
    description:
      "Health check for a RevealWhy project: is the tracking snippet sending data, how many sessions are captured and processed, and whether analytics are ready. Start here when the user asks 'is RevealWhy working on my site?'.",
    scope: "read:analytics",
    input: {},
    path: (pid) => `/api/analytics/project-status/${enc(pid)}`,
  },
  {
    name: "get_report",
    title: "Executive report",
    description:
      "The site's executive report: KPIs (sessions, conversions, conversion rate), the behavioural stories behind them and the top opportunities. Best single call for 'how is my website doing?' or 'give me a CRO summary'.",
    scope: "read:analytics",
    input: {},
    path: (pid) => `/api/report${qs({ projectId: pid })}`,
  },
  {
    name: "get_traffic",
    title: "Traffic over time",
    description:
      "Daily session counts for the last N days. Defaults to measured human traffic; pass trafficClass to see AI agents or crawlers instead.",
    scope: "read:analytics",
    input: {
      days: z.number().int().min(1).max(365).optional().describe("Window in days (default 7)"),
      trafficClass: z.enum(["human", "ai_agent", "crawler"]).optional().describe("Cohort to count"),
    },
    path: (pid, a) => `/api/traffic${qs({ projectId: pid, days: a.days, trafficClass: a.trafficClass })}`,
  },
  {
    name: "get_agent_traffic",
    title: "AI agent & bot traffic report",
    description:
      "How much of the site's traffic is AI agents (ChatGPT, Claude, Perplexity browsing), crawlers and humans, which pages agents read, and how that is trending. Use for 'are AI assistants visiting my site?' or GEO/AI-visibility questions.",
    scope: "read:analytics",
    input: { windowDays: z.number().int().min(1).max(365).optional().describe("Window in days") },
    path: (pid, a) => `/api/projects/${enc(pid)}/agent-traffic${qs({ windowDays: a.windowDays })}`,
  },

  // ── Pages & journeys ─────────────────────────────────────────────────────────────────────────
  {
    name: "get_top_pages",
    title: "Top pages",
    description: "Pages ranked by captured traffic (views = distinct sessions with capture data on that URL).",
    scope: "read:analytics",
    input: { limit: z.number().int().min(1).max(100).optional().describe("Number of pages (default 10)") },
    path: (pid, a) => `/api/projects/${enc(pid)}/top-pages${qs({ limit: a.limit ?? 10 })}`,
    render: (pages: any[]) =>
      !Array.isArray(pages) || pages.length === 0
        ? "# Top Pages\n\nNo page traffic captured yet for this project."
        : `# Top Pages\n\n${pages
            .map((p, i) => `${i + 1}. **${p.path ?? p.url}** — ${p.views} views\n   ${p.url}`)
            .join("\n")}`,
  },
  {
    name: "list_pages",
    title: "Analyzed pages",
    description:
      "Pages that have analyzed element-level data (the ones heatmap, attention and element tools can answer about). Use to find the exact pageUrl to pass to get_top_elements / get_element_performance.",
    scope: "read:analytics",
    input: {},
    path: (pid) => `/api/analytics/pages${qs({ projectId: pid })}`,
  },
  {
    name: "analyze_dropoff",
    title: "Drop-off analysis",
    description:
      "Where and why visitors leave: page-to-page drop-off points from live traffic with the behavioural signals behind each one (low engagement, quick exits, slow loads, back clicks). Use for 'where am I losing users?'.",
    scope: "read:analytics",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/journey-analytics`,
    render: (analysis: any) => {
      const dropoffs: any[] = analysis?.dropOffPoints || [];
      if (dropoffs.length === 0) return "# Drop-off Analysis\n\nNo drop-off points recorded yet for this project.";
      return `# Drop-off Analysis\n\n${dropoffs
        .map(
          (d) =>
            `## ${d.fromPage} → ${d.toPage ?? "(exit)"}\n**Drop-off Rate:** ${d.dropOffRate}% (${d.dropOffCount} visitors, avg ${d.avgTimeBeforeDropOff}s on page before leaving)\n\n**Signals:**\n${
              Array.isArray(d.insights) && d.insights.length > 0
                ? d.insights.map((r: string) => `- ${r}`).join("\n")
                : "- (no drop-off signals recorded)"
            }\n\n---`,
        )
        .join("\n\n")}`;
    },
  },
  {
    name: "get_journey_analytics",
    title: "Journey analytics",
    description:
      "Full journey analytics: common paths, entry/exit pages, drop-off points and conversion paths, optionally filtered by date range, device, country or converters only.",
    scope: "read:analytics",
    input: {
      startDate: date("Start date (YYYY-MM-DD)"),
      endDate: date("End date (YYYY-MM-DD)"),
      device: z.string().optional().describe("desktop | mobile | tablet"),
      country: z.string().optional().describe("ISO country code"),
      convertedOnly: z.boolean().optional().describe("Only sessions that converted"),
    },
    path: (pid, a) =>
      `/api/projects/${enc(pid)}/journey-analytics${qs({
        startDate: a.startDate,
        endDate: a.endDate,
        device: a.device,
        country: a.country,
        convertedOnly: a.convertedOnly,
      })}`,
  },
  {
    name: "get_visitor_journeys",
    title: "Returning-visitor journeys",
    description:
      "Multi-session journeys stitched per visitor: how many visitors return, how many sessions it takes to convert, and the per-visitor path list (capped at 500).",
    scope: "read:analytics",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/visitor-journeys`,
  },

  // ── Elements, attention & content ────────────────────────────────────────────────────────────
  {
    name: "get_top_elements",
    title: "Top elements on a page",
    description:
      "The elements on a page that get the most attention and interaction (heatmap v3): what visitors look at, hover and click. Pair with get_element_performance for one element.",
    scope: "read:analytics",
    input: {
      pageUrl: z.string().optional().describe("Page URL (from list_pages); omit for site-wide"),
      limit: z.number().int().min(1).max(100).optional().describe("Max elements (default 20)"),
      dateFrom: date("From date (YYYY-MM-DD)"),
      dateTo: date("To date (YYYY-MM-DD)"),
    },
    path: (pid, a) =>
      `/api/analytics/heatmap-v3/top-elements${qs({
        projectId: pid,
        pageUrl: a.pageUrl,
        limit: a.limit,
        dateFrom: a.dateFrom,
        dateTo: a.dateTo,
      })}`,
  },
  {
    name: "get_element_performance",
    title: "Element performance",
    description:
      "Attention and interaction metrics for one element (by CSS selector) or for every element on a page: visibility, dwell, hover, click-through.",
    scope: "read:analytics",
    input: {
      elementSelector: z.string().optional().describe("CSS selector of the element"),
      pageUrl: z.string().optional().describe("Page URL"),
      dateFrom: date("From date (YYYY-MM-DD)"),
      dateTo: date("To date (YYYY-MM-DD)"),
    },
    path: (pid, a) =>
      `/api/analytics/element-performance${qs({
        projectId: pid,
        elementSelector: a.elementSelector,
        pageUrl: a.pageUrl,
        dateFrom: a.dateFrom,
        dateTo: a.dateTo,
      })}`,
  },
  {
    name: "get_content_performance",
    title: "Content performance",
    description:
      "Which content blocks are read, skimmed or ignored — scroll depth, read time and engagement per content element, filterable by page, device, country and date.",
    scope: "read:analytics",
    input: {
      startDate: date("Start date (YYYY-MM-DD)"),
      endDate: date("End date (YYYY-MM-DD)"),
      pageUrl: z.string().optional().describe("Restrict to one page"),
      device: z.string().optional().describe("desktop | mobile | tablet"),
      country: z.string().optional().describe("ISO country code"),
    },
    path: (pid, a) =>
      `/api/projects/${enc(pid)}/content-performance${qs({
        startDate: a.startDate,
        endDate: a.endDate,
        pageUrl: a.pageUrl,
        device: a.device,
        country: a.country,
      })}`,
  },
  {
    name: "get_attention_calibration",
    title: "Attention calibration",
    description:
      "How well predicted attention matches measured visitor attention on this site — use before trusting attention-based claims.",
    scope: "read:findings",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/attention-calibration`,
  },

  // ── Conversions & goals ──────────────────────────────────────────────────────────────────────
  {
    name: "list_conversion_goals",
    title: "Conversion goals",
    description: "The conversion definitions configured for the site (purchase, sign-up, …) with their triggers and values.",
    scope: "read:analytics",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/conversions`,
  },
  {
    name: "get_conversion_stats",
    title: "Conversion stats",
    description: "Conversion counts, rates and value by goal.",
    scope: "read:analytics",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/conversions/stats`,
  },
  {
    name: "list_conversion_events",
    title: "Conversion events",
    description: "Recent individual conversion events (newest first), paginated.",
    scope: "read:analytics",
    input: {
      limit: z.number().int().min(1).max(500).optional().describe("Page size (default 100)"),
      offset: z.number().int().min(0).optional().describe("Offset"),
    },
    path: (pid, a) => `/api/projects/${enc(pid)}/conversions/events${qs({ limit: a.limit, offset: a.offset })}`,
  },
  {
    name: "list_goals",
    title: "Goals with performance",
    description: "Goals with how many sessions reach them and their conversion rate — the funnel targets findings are measured against.",
    scope: "read:findings",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/goals`,
  },
  {
    name: "get_goal_journey",
    title: "Journey to a goal",
    description: "The paths visitors take toward one goal and where goal-seekers fall out — a funnel localized to the step that loses people.",
    scope: "read:findings",
    input: { goalId: z.string().min(1).describe("Goal ID (from list_goals)") },
    path: (pid, a) => `/api/projects/${enc(pid)}/goals/${enc(a.goalId)}/journey`,
  },
  {
    name: "suggest_goals",
    title: "Suggested goals",
    description: "Conversion goals RevealWhy detected on the site that are not configured yet (e.g. a sign-up form or checkout button).",
    scope: "read:findings",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/goals/suggestions`,
  },

  // ── Findings (the grounded "why") ────────────────────────────────────────────────────────────
  {
    name: "list_findings",
    title: "Findings",
    description:
      "RevealWhy's grounded findings — where real visitor behaviour diverges from what each page is for. Each finding has the change, the mechanism (why, as a hypothesis), the basis (proven/observed/principle), a calibrated confidence, the evidence layer (expected lift, percentile frame, prerequisite checks) and a bounded suggested_action. The main 'what should I fix on my site?' tool.",
    scope: "read:findings",
    input: {
      pageKeyId: z.string().optional().describe("Filter to one page"),
      status: findingStatus,
    },
    path: (pid, a) => `/api/projects/${enc(pid)}/findings${qs({ pageKeyId: a.pageKeyId, status: a.status })}`,
  },
  {
    name: "get_finding",
    title: "Finding",
    description: "One finding by id — the full typed Finding object (change, mechanism, evidence, basis, confidence, suggested_action).",
    scope: "read:findings",
    input: { findingId: z.string().min(1).describe("Finding ID") },
    path: (pid, a) => `/api/projects/${enc(pid)}/findings/${enc(a.findingId)}`,
  },
  {
    name: "get_finding_evidence",
    title: "Finding evidence",
    description: "The behavioural evidence behind a finding: the sessions and events on that element and page that support it.",
    scope: "read:findings",
    input: { findingId: z.string().min(1).describe("Finding ID") },
    path: (pid, a) => `/api/projects/${enc(pid)}/findings/${enc(a.findingId)}/evidence`,
  },
  {
    name: "get_progress",
    title: "Findings progress",
    description: "The findings inventory as a maturity picture — counts by lifecycle status and by basis (how many are proven by A/B tests).",
    scope: "read:findings",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/progress`,
  },
  {
    name: "get_audience",
    title: "Audience segments",
    description: "Behavioural audience segments discovered from real sessions, described in plain language (who visits, what they do, how they convert).",
    scope: "read:findings",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/audience`,
  },
  {
    name: "get_site_graph",
    title: "Site graph",
    description: "The page→page structure of the site as visitors actually navigate it (sequence-first site map with transition volumes).",
    scope: "read:findings",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/site-graph`,
  },
  {
    name: "list_template_groups",
    title: "Page template groups",
    description: "Pages grouped by template (e.g. all product pages), so findings and metrics can be read per template instead of per URL.",
    scope: "read:findings",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/template-groups`,
  },

  // ── Experiments & proof ──────────────────────────────────────────────────────────────────────
  {
    name: "list_experiments",
    title: "Experiments",
    description: "The site's A/B experiments and content studies with status, variants and linked goal.",
    scope: "read:findings",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/experiments`,
  },
  {
    name: "get_experiment_verdict",
    title: "Experiment verdict",
    description:
      "Per-variant results for one A/B experiment: always-valid (mSPRT) verdict, lift and SRM check. Use for 'did my test win?'.",
    scope: "read:findings",
    input: { experimentId: z.string().min(1).describe("Experiment ID (from list_experiments)") },
    path: (pid, a) => `/api/projects/${enc(pid)}/experiments/${enc(a.experimentId)}/verdict`,
  },
  {
    name: "get_scoreboard",
    title: "Scoreboard",
    description: "'Am I winning?' — the cumulative impact of shipped and tested improvements.",
    scope: "read:findings",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/scoreboard`,
  },
  {
    name: "list_improvements",
    title: "Improvements",
    description: "The improvement backlog and its lifecycle (suggested → shipped → measuring → verdict).",
    scope: "read:findings",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/improvements`,
  },
  {
    name: "get_autopilot",
    title: "Autopilot readiness",
    description: "Per change-class win rate and whether each class has earned auto-apply — the evidence for how much to trust automated changes.",
    scope: "read:findings",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/autopilot`,
  },
];
