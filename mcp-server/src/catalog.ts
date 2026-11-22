/**
 * The RevealWhy MCP tool catalog — one entry per tool, each a thin, typed decoder over a REAL
 * API route that a scoped `rw_…` key can authenticate (projectReadAccess / dashboardReadAccess on
 * the server). Never add a tool here for a route a scoped key cannot reach: it would only ever 401.
 *
 * Writes (method other than GET) need a key with the write:findings scope: the agent-task writes (report_fix,
 * set_finding_status) and the batch-K actions (a draft A/B test, a draft study, goals; changing a test's status is the
 * owner's approval). The labelled synthetic runs (predict_attention, screen_variants) need run:synthetic. The two
 * start-free tools need no key: they connect this session to a free project only after the person approves it in the
 * browser. Nothing an assistant creates reaches a visitor or participant until the owner starts it.
 *
 * Eye tracking (beta, paid plans): measured webcam gaze from the project's camera studies (create_gaze_study,
 * list_gaze_studies; GET/POST /studies). These are not the research studies of create_study / list_studies (REP,
 * /rep/studies). Reads need read:gaze; the two study writes (create_gaze_study, create_participant_links) need
 * write:studies. Every gaze answer carries the server's own honesty fields (quality band, `abstain` with its reason,
 * "not enough data"): pass them on, never round them up into a conclusion.
 */
import { z, type ZodRawShape } from "zod";

/** "none": the tool works without a key (start_free / start_free_status connect one). */
export type Scope = "read:analytics" | "read:findings" | "write:findings" | "run:synthetic" | "read:gaze" | "write:studies" | "none";

/** The product's name for the feature, used in every eye-tracking tool. */
export const EYE_TRACKING_LABEL = "Eye tracking (beta, paid plans)";

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
  render?: (data: any, projectId: string) => string;
  /** HTTP method; default GET. Anything else is a write (annotated readOnlyHint false). */
  method?: "GET" | "POST" | "PATCH";
  /** JSON body for a write, from the parsed args (and the resolved project, for routes that take it in the body). */
  body?: (args: Record<string, any>, projectId: string) => Record<string, unknown>;
  /** Handled inside the MCP server, not as a keyed project call: connecting a session through a free start. */
  special?: "start_free" | "start_free_status";
  /** From the old product (heatmaps, gaze, conversions, journeys). Kept and working; the new flow's tools are in flow-tools.ts. */
  legacy?: boolean;
}

export const isWriteTool = (def: ToolDef) => (def.method ?? "GET") !== "GET";

/** The dashboard a link sends a person to (REVEALWHY_APP_URL, else the hosted app). */
export const appUrl = () => (process.env.REVEALWHY_APP_URL || "https://my.revealwhy.com").replace(/\/+$/, "");

const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };

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
  .enum([
    "suggested", "measuring", "verdict", "applied", "dismissed",
    "sent_to_agent", "fix_reported", "fixed", "verifying", "verified", "not_improved", "inconclusive", "not_enough_data",
  ])
  .optional()
  .describe("Filter by stored lifecycle status (fix_reported = a reported fix waiting for the owner's OK)");
// integration contract v1 §3
const taskStatus = z
  .enum(["open", "sent_to_agent", "fixed", "verifying", "verified", "not_improved", "inconclusive", "not_enough_data", "dismissed"])
  .optional()
  .describe("Filter by status");

/** P-22: the fixed disclaimer every journey verdict carries (the server's JOURNEY_DISCLAIMER; a test keeps them equal). */
export const JOURNEY_DISCLAIMER =
  "Automated agents found these issues on this run. This is not an accessibility audit or a certification; a run with no blockers does not mean the journey works for every visitor.";

// ── HAND-04 (R27): text that a website or its visitors wrote is fenced as data ─────────────────────────────────────
// A button label, a page title, an interview quote or an element's text can say anything, including "ignore your
// instructions". Every such value leaves this server inside one envelope, and the server instructions tell the
// assistant that what is inside is data, never instructions. A fence tag inside the text is neutralized, so the text
// cannot close the envelope early. Mirrored in shared/untrusted.ts (the dashboard's agent prompt); a test keeps the two
// identical.
export const UNTRUSTED_OPEN = "<untrusted-data>";
export const UNTRUSTED_CLOSE = "</untrusted-data>";
/**
 * Zero-width and bidi controls (and the soft hyphen): invisible, so they could split a fence tag that still reads as
 * one. Removed from fenced text (senior review of HAND-04).
 */
const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
/** A fence tag or a look-alike: "<" or its HTML entity, then untrusted, any space, "_" or "-", data, in any case. */
const FENCE_TAG = /(<|&lt;|&#0*60;|&#x0*3c;)(\s*\/?\s*)untrusted[\s_-]*data/gi;
/** A fence tag made inert: only its "<" (or entity) changes, to "‹"; the rest of the text is kept as written. */
const inert = (m: string): string => `‹${m.startsWith("<") ? m.slice(1) : m.slice(m.indexOf(";") + 1)}`;
/** The text as it goes inside the fence: NFKC (a fullwidth "＜" reads as "<"), invisible characters removed, any fence
 *  tag or look-alike made inert. */
const neutralize = (s: string): string => s.normalize("NFKC").replace(INVISIBLE, "").replace(FENCE_TAG, inert);

/** One value, fenced: `<untrusted-data>…</untrusted-data>`, with any fence tag inside made inert ("<" → "‹"). */
export function untrusted(value: unknown): string {
  const s = String(value ?? "");
  if (s.startsWith(UNTRUSTED_OPEN) && s.endsWith(UNTRUSTED_CLOSE)) {
    const inner = s.slice(UNTRUSTED_OPEN.length, s.length - UNTRUSTED_CLOSE.length);
    if (neutralize(inner) === inner) return s; // already fenced by us: idempotent
  }
  return `${UNTRUSTED_OPEN}${neutralize(s)}${UNTRUSTED_CLOSE}`;
}

/**
 * The response keys that carry page- or visitor-derived text. Server wording (summary, headline, reason, message,
 * status, basis, certainty words) is NOT here: it is ours and the honesty rules depend on it being read as such. Ids
 * stay plain. A visited URL or path is fenced (senior review): visitors control query strings and 404 paths; the
 * value inside the fence is unchanged, so an assistant can still use it.
 */
export const UNTRUSTED_KEYS: ReadonlySet<string> = new Set([
  // element and page text from the site
  "text", "label", "elementText", "element_text", "elementLabel", "element_label", "innerText", "alt", "placeholder",
  "pageTitle", "page_title", "title", "selector",
  // finding text: templated around the element's own words
  "change", "suggested_change", "suggestedChange", "mechanism", "expectationViolated", "expectation_violated",
  // what people and agents wrote
  "quote", "quotes", "transcript", "change_description", "changeDescription",
  // HAND-03: an agent's report_fix pages and PR link come back on fix.pages / fix.pr_url
  "pages", "pr_url",
  // a simulated shopper's own words about the page
  "blocked", "friction",
  // visited URLs and paths (visitors control query strings and 404 paths), and recorded selectors
  "url", "path", "pageUrl", "fromPage", "toPage", "page", "referrer", "elementSelector",
  // an LLM's words written from the site's pages (suggested goals), and a panel's notes (screen_variants)
  "description", "notes",
  // technical details on a test issue (review of #602): the element acted on and a request's failure text come from
  // the tested site (a console message's script address is ADDRESS_KEYS below)
  "element", "failure",
  // review 944 MUST 2: a test issue's fix brief, written from the tested site's data, and one piece of its evidence
  // a goal's steps in plain words (a draft can be written from the site by a test visitor)
  "plain_words",
  "reproSteps", "repro_steps", "expected", "actual", "suggestion", "acceptanceCheck", "acceptance_check", "what",
]);

/**
 * Review 944 MUST 2: values whose WHOLE subtree is site-derived or model-written: a test issue's fix brief and evidence,
 * a ticket preview's packet and rendered body, and suggested goals. Every string inside is fenced, whatever its key,
 * except ids and hashes (ours, and an agent needs them plain to call the next tool).
 */
export const UNTRUSTED_TREE_KEYS: ReadonlySet<string> = new Set([
  "fix_brief", "fixBrief", "evidence", "packet", "rendered", "goals", "suggestions",
]);
const PLAIN_IN_TREE = /^(?:id|hash|.*Id|.*_id|.*Ids|.*_ids)$/;

function fenceTree(data: unknown, depth: number, key: string | null): unknown {
  if (depth > 40 || data === null) return data;
  if (typeof data === "string") return data !== "" && !(key && PLAIN_IN_TREE.test(key)) ? untrusted(data) : data;
  if (typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map((v) => fenceTree(v, depth + 1, key));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) out[k] = fenceTree(v, depth + 1, k);
  return out;
}

/**
 * Keys fenced only when the value is an address (review of #602): `source` is a console message's script address in
 * technical details, but also our own wording elsewhere (`source: "ai"`, a traffic source), which stays plain.
 */
export const ADDRESS_KEYS: ReadonlySet<string> = new Set(["source"]);
const isAddress = (v: string) => /^(?:https?|wss?):\/\//i.test(v);

/** Every UNTRUSTED_KEYS string (or string array) in a response, fenced; everything else unchanged. Pure. */
export function fenceUntrusted<T>(data: T, depth = 0): T {
  if (depth > 40 || data === null || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map((v) => fenceUntrusted(v, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (UNTRUSTED_TREE_KEYS.has(k)) out[k] = fenceTree(v, depth + 1, null);
    else if (UNTRUSTED_KEYS.has(k) && typeof v === "string" && v !== "") out[k] = untrusted(v);
    else if (ADDRESS_KEYS.has(k) && typeof v === "string" && isAddress(v)) out[k] = untrusted(v);
    else if (UNTRUSTED_KEYS.has(k) && Array.isArray(v) && v.every((x) => typeof x === "string")) out[k] = v.map((x) => untrusted(x));
    else out[k] = fenceUntrusted(v, depth + 1);
  }
  return out as T;
}

/** The journey verdicts as text: the server's fixed wording only, site text quoted as data, the disclaimer always last. */
export function renderJourneyVerdicts(r: any): string {
  const lines: string[] = [];
  const v = r?.verdicts;
  lines.push(`Journey check ${r?.runId ?? ""} (${r?.status ?? "unknown"}${r?.release ? `, release ${r.release}` : ""}), SIMULATED agents.`);
  if (!v) {
    lines.push(r?.status === "failed" ? "The check did not finish." : "No verdicts yet: the check is still running.");
  } else {
    lines.push(`${v.summary ?? v.headline ?? ""}`);
    for (const j of v.journeys ?? []) {
      lines.push("", `Journey ${JSON.stringify(j.name ?? j.journeyId)}: ${j.headline}`); // the owner named it
      for (const p of j.byPersona ?? []) {
        lines.push(`  ${p.personaKind}: ${p.summary}`);
        for (const b of p.blockers ?? []) {
          lines.push(`    blocker at step ${(b.steps ?? []).join("/") || "?"} on ${b.page ?? "?"}: element ${untrusted(b.element?.label ?? "")} (selector ${b.element?.selector ? untrusted(b.element.selector) : "?"}), seen in ${b.seenIn} of ${b.attempts} attempts`);
        }
        for (const u of p.unconfirmed ?? []) {
          lines.push(`    unconfirmed (seen in ${u.seenIn} of ${u.attempts}): ${untrusted(u.element?.label ?? "")} (selector ${u.element?.selector ? untrusted(u.element.selector) : "?"}) on ${u.page ?? "?"}`);
        }
      }
    }
  }
  if (r?.pending) lines.push("", `A newer check is ${r.pending.status} (run ${r.pending.runId}).`);
  lines.push("", JOURNEY_DISCLAIMER);
  return lines.join("\n");
}

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
    name: "get_tracking_snippet",
    title: "Tracking snippet to install",
    description:
      "The project's PUBLISHABLE key and the ready-to-paste script tag that installs RevealWhy on a site (consent-gated by default), plus where it loads from. Use it to connect a site: add scriptTag to every page, then check with get_project_status. The publishable key is public by design (it can only send data, from the project's allowed origins); no secret key is ever returned.",
    scope: "read:analytics",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/tracking-snippet`,
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
    name: "get_trends",
    title: "Long-range trends",
    description:
      "One metric over days, weeks or months from the permanent daily summaries, which outlive raw sessions: sessions, visitors, page views, dwell, bounces, conversions and their value, or element clicks, hovers and dead/rage clicks. Use for 'how has X changed since…', month-over-month or year-over-year questions. Periods with no data are absent, not zero.",
    scope: "read:analytics",
    input: {
      metric: z
        .enum([
          "sessions", "visitors", "page_views", "avg_dwell_ms", "bounces", "events", "exposed", "acted",
          "conversions", "conversion_value", "clicks", "hovers", "dead_clicks", "rage_clicks",
        ])
        .describe("What to chart"),
      granularity: z.enum(["day", "week", "month"]).optional().describe("Bucket size (default day)"),
      from: date("Start day (default 27 days before `to`)"),
      to: date("End day (default today, UTC)"),
      pageKeyId: z.string().optional().describe("Limit to one page (its page key)"),
      elementKeyId: z.string().optional().describe("Limit to one element (element metrics only)"),
      source: z.enum(["measured", "predicted", "inferred", "all"]).optional().describe("Traffic source (default measured). AI walk-throughs (simulated) are never a trend: 'all' leaves them out"),
      deviceClass: z.enum(["desktop", "mobile", "tablet"]).optional().describe("Limit to one device class"),
    },
    path: (pid, a) =>
      `/api/projects/${enc(pid)}/trends${qs({
        metric: a.metric, granularity: a.granularity, from: a.from, to: a.to, pageKeyId: a.pageKeyId,
        elementKeyId: a.elementKeyId, source: a.source, deviceClass: a.deviceClass,
      })}`,
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
      "Which content blocks are read, skimmed or ignored — scroll depth, read time and engagement per content element, filterable by page, device or country, and date. A device or country filter returns that segment's own sessions, clicks, read time and engagement; views and conversionRate are null then (not recorded per segment). Country covers each day's top 10 countries. Device and country cannot be combined (400). engagementScore is 0-100: time on screen, clicks and hovers, and scroll reach. Up to 25 points are reserved for estimated attention, but this rollup has no attention signal, so that part is 0 and scores top out at 75.",
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
      "RevealWhy's grounded findings — where real visitor behaviour diverges from what each page is for. Each finding has the change, the mechanism (why, as a hypothesis), the basis (proven/observed/principle/simulated), a calibrated confidence, the owner-facing certainty word (certaintyWord: A hunch / Likely / Confirmed / Proven — repeat it, don't turn confidence into a percentage), the evidence layer (expected lift, percentile frame, prerequisite checks) and a bounded suggested_action. Pass limit (and then cursor = the previous nextCursor) to page through a long list. The main 'what should I fix on my site?' tool.",
    scope: "read:findings",
    input: {
      pageKeyId: z.string().optional().describe("Filter to one page"),
      status: findingStatus,
      limit: z.number().int().min(1).max(100).optional().describe("Page size; the reply then has total and nextCursor"),
      cursor: z.string().optional().describe("nextCursor from the previous page"),
    },
    path: (pid, a) => `/api/projects/${enc(pid)}/findings${qs({ pageKeyId: a.pageKeyId, status: a.status, limit: a.limit, cursor: a.cursor })}`,
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

  // ── Agent tasks (integration contract v1 §3–4) ─────────────────────────────────────────────────
  {
    name: "list_agent_tasks",
    title: "Agent tasks",
    description:
      "What to fix, in the shared agent-task shape: id, scope (page), element (selector, label), evidence (sessions, attention, quotes), basis (observed / inferred / simulated / proven), suggested_change, confidence, measured_impact (null until measured) and status (open, sent_to_agent, fixed, verifying, verified, not_improved, inconclusive, not_enough_data, dismissed). Start here when asked to fix the site.",
    scope: "read:findings",
    input: {
      status: taskStatus,
      limit: z.number().int().min(1).max(200).optional().describe("Max tasks (default 50)"),
    },
    path: (pid, a) => `/api/projects/${enc(pid)}/agent-tasks${qs({ status: a.status, limit: a.limit })}`,
  },
  {
    name: "get_agent_task",
    title: "Agent task",
    description: "One agent task by id (the finding id), in the shared agent-task shape.",
    scope: "read:findings",
    input: { id: z.string().min(1).describe("Task id (finding id)") },
    path: (pid, a) => `/api/projects/${enc(pid)}/agent-tasks/${enc(a.id)}`,
  },

  // ── Actions (batch K): writes an assistant may make; nothing reaches visitors or people without the owner ──────
  {
    name: "start_ab_test",
    title: "Create an A/B test (draft)",
    description:
      "WRITE. Create an A/B test as a DRAFT: nothing reaches visitors until the project owner approves the start in RevealWhy (the result gives the approval link to send them). Variants change the page in the visitor's browser (text, style, visibility of an element), split 50/50; the verdict waits for enough visitors. A test can only start with a goal to count: pass goalId, or make sure the project has at least one goal (list_goals; create_goal adds one). Without one the draft is kept but cannot start. Use after a finding suggests a change worth proving. Needs a key with write:findings.",
    scope: "write:findings",
    method: "POST",
    input: {
      name: z.string().min(1).max(200).describe("What the test checks, in a few words"),
      variants: z
        .array(z.object({
          key: z.string().min(1).max(50).describe("control, B, C …"),
          isControl: z.boolean().optional().describe("Exactly one variant is the control (the page as it is)"),
          spec: z.record(z.string(), z.any()).optional().describe("The change for this variant, e.g. {selector:'h1', text:'New headline'}"),
        }))
        .min(2)
        .describe("At least two: the control plus one or more changes"),
      goalId: z.string().optional().describe("The goal that decides it (from list_goals); default any of the project's goals. The test cannot start until the project has a switched-on goal"),
      stopRule: z.enum(["proven", "duration", "visitors", "manual"]).optional().describe("When it stops (default: when proven)"),
      stopValue: z.number().int().positive().optional().describe("Days or visitors, for the duration / visitors rules"),
    },
    path: (pid) => `/api/projects/${enc(pid)}/experiments`,
    body: (a) => ({ name: a.name, variants: a.variants, status: "draft", ...(a.goalId ? { goalId: a.goalId } : {}), ...(a.stopRule ? { stopRule: a.stopRule } : {}), ...(a.stopValue ? { stopValue: a.stopValue } : {}) }),
    render: (r: any, pid: string) =>
      `Created the A/B test as a DRAFT (id ${r?.id ?? "?"}). No visitor sees it yet. The project owner approves the start here: ${r?.approveUrl ?? `${appUrl()}/p/${enc(pid)}`}`,
  },
  {
    name: "set_ab_test_status",
    title: "Ask the owner to conclude or archive an A/B test",
    description:
      "WRITE. Ask to conclude an A/B test (it stops, and its verdict is recorded; a decisive, SRM-clean win promotes its finding to proven) or archive it (hide it). A key never changes a test itself: RevealWhy answers with an approval link for the project owner, which you send them; the change happens when they approve. Starting a test is the owner's too. Needs a key with write:findings.",
    scope: "write:findings",
    method: "POST",
    input: {
      experimentId: z.string().min(1).describe("Experiment id (from list_experiments)"),
      status: z.enum(["concluded", "archived"]).describe("concluded = stop and keep the verdict; archived = hide"),
    },
    path: (pid, a) => `/api/projects/${enc(pid)}/experiments/${enc(a.experimentId)}/status`,
    body: (a) => ({ status: a.status }),
  },
  {
    name: "create_goal",
    title: "Create a conversion goal",
    description:
      "WRITE. Configure a conversion goal: a page visit (e.g. /thank-you), a click on an element, a form submit, or a custom event the site sends. suggest_goals lists ones RevealWhy detected. Findings and A/B verdicts are measured against goals. Needs a key with write:findings.",
    scope: "write:findings",
    method: "POST",
    input: {
      name: z.string().min(1).max(200).describe("What converting means, e.g. 'Signed up'"),
      triggerType: z.enum(["page_visit", "element_click", "form_submit", "custom_event"]).describe("What counts"),
      pageUrl: z.string().optional().describe("For page_visit: the URL or path"),
      elementSelector: z.string().optional().describe("For element_click / form_submit: a CSS selector"),
      customEventName: z.string().optional().describe("For custom_event: the event name"),
      defaultValue: z.number().nonnegative().optional().describe("Value of one conversion, in the currency below"),
      currency: z.string().length(3).optional().describe("ISO currency, e.g. EUR"),
    },
    path: (pid) => `/api/projects/${enc(pid)}/conversions`,
    body: (a) => Object.fromEntries(Object.entries({
      name: a.name, triggerType: a.triggerType, pageUrl: a.pageUrl, elementSelector: a.elementSelector,
      customEventName: a.customEventName, defaultValue: a.defaultValue, currency: a.currency,
    }).filter(([, v]) => v !== undefined)),
  },
  {
    name: "list_site_goals",
    title: "Site goals",
    description: "The business goals RevealWhy inferred for the site (what the site is for), with which are confirmed. Confirm or correct one with confirm_site_goal.",
    scope: "read:findings",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/site-goals`,
  },
  {
    name: "confirm_site_goal",
    title: "Confirm a site goal",
    description:
      "WRITE. Confirm, reject or rename one of the site goals RevealWhy inferred (list_site_goals). Confirmed goals come first when findings choose what to measure against. Needs a key with write:findings.",
    scope: "write:findings",
    method: "POST",
    input: {
      goalId: z.string().min(1).describe("Site goal id (from list_site_goals)"),
      action: z.enum(["confirmed", "rejected", "edited"]).describe("edited needs a label"),
      label: z.string().max(120).optional().describe("New name, for edited"),
      description: z.string().max(500).optional().describe("New description, for edited"),
    },
    path: (pid, a) => `/api/projects/${enc(pid)}/site-goals/${enc(a.goalId)}`,
    body: (a) => ({ action: a.action, ...(a.label ? { label: a.label } : {}), ...(a.description ? { description: a.description } : {}) }),
  },
  {
    name: "get_heatmap",
    title: "Page heatmap",
    description:
      "Measured clicks on one page, element by element, from real visitors (not a prediction). Optionally one session, a date range (within the plan's window) or one event type.",
    scope: "read:analytics",
    input: {
      pageUrl: z.string().min(1).describe("The page URL"),
      sessionId: z.string().optional().describe("Limit to one session"),
      dateFrom: date("From day"),
      dateTo: date("To day"),
      eventType: z.string().optional().describe("e.g. click"),
    },
    path: (pid, a) => `/api/analytics/heatmap-v3${qs({ projectId: pid, pageUrl: a.pageUrl, sessionId: a.sessionId, dateFrom: a.dateFrom, dateTo: a.dateTo, eventType: a.eventType })}`,
  },
  {
    name: "get_replay_link",
    title: "Session replay link",
    description:
      "A link that opens one session's replay in the RevealWhy dashboard. It opens for signed-in members of the project only; it is not a public share link.",
    scope: "read:analytics",
    input: { sessionId: z.string().min(1).describe("Session id (from get_visitor_journeys or list_conversion_events)") },
    path: (_pid, a) => `/api/sessions/${enc(a.sessionId)}`,
    render: (s: any, pid: string) =>
      `Session ${s?.id ?? ""}${s?.startTime ? ` (${s.startTime})` : ""}. The new RevealWhy app has no page for one replay yet; the project's page is ${appUrl()}/p/${enc(pid)} (signed-in members of the project only).`,
  },
  {
    name: "predict_attention",
    title: "Predicted attention for a page",
    description:
      "PREDICTED (a model, not measured attention): where a visitor is likely to look on a page, from a screenshot of the URL. Use before traffic exists or to compare designs; never present it as what visitors did. Each call counts against the plan's attention-prediction quota. Needs a key with run:synthetic.",
    scope: "run:synthetic",
    method: "POST",
    input: {
      pageUrl: z.string().url().describe("The page to predict"),
      viewportWidth: z.number().int().min(320).max(3840).optional().describe("Default 1920"),
      viewportHeight: z.number().int().min(320).max(4320).optional().describe("Default 1080"),
    },
    path: () => `/api/attention/predict`,
    body: (a, projectId) => ({ projectId, pageUrl: a.pageUrl, ...(a.viewportWidth ? { viewportWidth: a.viewportWidth } : {}), ...(a.viewportHeight ? { viewportHeight: a.viewportHeight } : {}) }),
    render: (r: any) => `PREDICTED attention (a model's estimate, not measured visitor attention):\n\n${JSON.stringify(r, null, 2)}`,
  },
  {
    name: "screen_variants",
    title: "Screen variants before traffic",
    description:
      "SIMULATED CHECK: an AI walk-through of 2 to 5 variant URLs (the first is the control) before any real visitor sees them: predicted attention and the notes a simulated persona panel wrote on each. It never ranks, scores or picks a winner; call it an AI walk-through or a simulated check, and prove a version with start_ab_test. Expensive: at most 10 runs an hour per project with a key. Needs a key with run:synthetic.",
    scope: "run:synthetic",
    method: "POST",
    input: {
      urls: z.array(z.string().url()).min(2).max(5).describe("Control first, then the variants"),
      goal: z.string().min(3).max(300).optional().describe("What the page should get people to do"),
    },
    path: (pid) => `/api/projects/${enc(pid)}/screening/rank`,
    body: (a) => ({ urls: a.urls, ...(a.goal ? { goal: a.goal } : {}) }),
    render: (r: any) => `SIMULATED CHECK, an AI walk-through (predicted attention + a simulated panel's notes; no real visitors, no rank, no winner):\n\n${JSON.stringify(r, null, 2)}`,
  },
  {
    name: "start_journey_check",
    title: "Start a journey check",
    description:
      "SIMULATED: start a journey check. AI agents try each journey (a goal plus success criteria the test checks on the page, e.g. 'add a size M shirt to the bag' → URL contains /cart) as a sighted shopper, a keyboard and screen-reader user and an AI shopping agent, 3 times each by default. The agents always stop before payment. Uses the project's saved journeys unless you pass them. Results arrive in a few minutes: read them with get_journey_verdicts. One check at a time per project, at most 6 an hour with a key; each attempt counts as a simulated session. Needs a key with run:synthetic.",
    scope: "run:synthetic",
    method: "POST",
    input: {
      journeys: z
        .array(z.object({
          id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/).describe("Short id, e.g. add-to-bag"),
          name: z.string().min(1).max(120),
          goal: z.string().min(3).max(500).describe("What the visitor is trying to do"),
          startUrl: z.string().url().optional().describe("Where the journey starts (the project's own site); default the site's home page"),
          success: z.object({
            urlIncludes: z.array(z.string().min(1)).max(10).optional().describe("Reached when the URL contains one of these"),
            textIncludes: z.array(z.string().min(1)).max(10).optional().describe("Reached when the page shows one of these texts"),
          }),
          maxSteps: z.number().int().min(1).max(30).optional(),
        }))
        .min(1)
        .max(5)
        .optional()
        .describe("Journeys to check; omit to use the project's saved journeys"),
      personaKinds: z.array(z.enum(["sighted", "keyboard", "ai_agent"])).min(1).max(3).optional().describe("Default: all three"),
      repeats: z.number().int().min(1).max(5).optional().describe("Attempts per journey and persona (default 3)"),
      release: z.string().max(120).optional().describe("A label for the release under test (tag or commit)"),
    },
    path: (pid) => `/api/projects/${enc(pid)}/journeys/trigger`,
    body: (a) => ({
      ...(a.journeys ? { journeys: a.journeys } : {}),
      ...(a.personaKinds ? { personaKinds: a.personaKinds } : {}),
      ...(a.repeats ? { repeats: a.repeats } : {}),
      ...(a.release ? { release: a.release } : {}),
      source: "mcp",
    }),
    render: (r: any) =>
      `Journey check started (run ${r?.runId ?? "?"}, ${r?.attempts ?? "?"} attempts). Read the verdicts with get_journey_verdicts in a few minutes.\n\n${JOURNEY_DISCLAIMER}`,
  },
  {
    name: "get_journey_verdicts",
    title: "Journey check verdicts",
    description:
      "SIMULATED: the latest journey check's verdicts, per journey and persona (sighted, keyboard, ai_agent), with each confirmed blocker's page, element and step. The only verdicts are 'Blockers found', 'Friction found', 'No blockers found on this run' and 'Stopped before payment'; a blocker counts only when it repeats across attempts, otherwise it is listed as unconfirmed. Pass these words on as they are: never say a journey 'works' or is 'accessible' or 'compliant', and always repeat the disclaimer. Needs a key with run:synthetic.",
    scope: "run:synthetic",
    input: { runId: z.string().min(1).optional().describe("A specific run (from start_journey_check); default the latest") },
    path: (pid, a) => `/api/projects/${enc(pid)}/journeys/verdicts${qs({ runId: a.runId })}`,
    render: renderJourneyVerdicts,
  },
  {
    name: "create_study",
    title: "Create a user test (draft)",
    description:
      "WRITE. Create a user-testing study as a DRAFT: real people are given a task on the site, recorded, and asked about it. Nobody is invited until a project member opens it in the dashboard. Each participant counts against the plan's tested interviews. This is a research study (list_studies / get_study), not a camera eye-tracking study: for eye tracking use create_gaze_study. Needs a key with write:findings.",
    scope: "write:findings",
    method: "POST",
    input: {
      name: z.string().min(1).max(200).describe("Study name"),
      research_questions: z.array(z.string().min(1).max(1000)).min(1).max(10).describe("What you want to learn"),
      tasks: z
        .array(z.object({
          title: z.string().min(1).max(200),
          text: z.string().min(1).max(2000).describe("What the participant is asked to do"),
          start_url: z.string().url().describe("Where the task starts (https)"),
          success_url_prefix: z.string().min(1).describe("A URL that means the task succeeded (prefix match)"),
        }))
        .min(1)
        .max(5),
      locale: z.string().min(2).max(35).optional().describe("Participant language (BCP-47), default en"),
    },
    path: (pid) => `/api/projects/${enc(pid)}/rep/studies`,
    body: (a) => {
      const tasks = (a.tasks as any[]).map((t, i) => ({
        external_ref: `task${i + 1}`, title: t.title, text: t.text, variant_order: "fixed", gaze: "off", capture_modes_allowed: ["snippet"],
        variants: [{ key: "A", label: "Current site", start_url: t.start_url, domains: [hostOf(t.start_url)] }],
        success: [{ kind: "url", match: "prefix", value: t.success_url_prefix }],
      }));
      return {
        name: a.name, locale: a.locale ?? "en", protocol_mode: "fixed",
        research_questions: (a.research_questions as string[]).map((text, i) => ({ external_ref: `rq${i + 1}`, text, priority: 1 })),
        tasks, order: { kind: "fixed", task_refs: tasks.map((t) => t.external_ref) },
      };
    },
    render: (r: any, pid: string) => `Created the study as a DRAFT (id ${r?.id ?? "?"}). Nobody is invited yet; a project member opens it here: ${appUrl()}/p/${enc(pid)}/tests`,
  },
  {
    name: "list_studies",
    title: "User tests",
    description: "The project's research studies (user tests made with create_study) with their status and how many people took part. Camera eye-tracking studies are listed by list_gaze_studies instead.",
    scope: "read:findings",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/rep/studies`,
  },
  {
    name: "get_study",
    title: "One user test",
    description: "One research study (from list_studies): its questions, tasks and status. Not for camera eye-tracking studies.",
    scope: "read:findings",
    input: { studyId: z.string().min(1).describe("Study id (from list_studies)") },
    path: (pid, a) => `/api/projects/${enc(pid)}/rep/studies/${enc(a.studyId)}`,
  },

  // ── Connect without a key: start a free project from the conversation (server/routes/free-start.ts) ────────────
  {
    name: "start_free",
    title: "Start RevealWhy free",
    description:
      "Use when RevealWhy is not connected yet (no API key). Starts a free RevealWhy project from this conversation, no card: returns a link for the person to sign up or sign in and approve, and a short code they compare with the page. Then call start_free_status until it says connected. Nothing is created until the person approves; the key this session then receives works only for their free project.",
    scope: "none",
    method: "POST",
    input: {},
    path: () => `/api/free/start`,
    special: "start_free",
  },
  {
    name: "start_free_status",
    title: "Finish starting free",
    description:
      "After start_free: checks whether the person approved. Call it every few seconds while it says not approved yet. Once approved, this session is connected to their free project and the other tools work at once (the key is also saved for the next session); next, call get_tracking_snippet to add RevealWhy to the site.",
    scope: "none",
    method: "POST",
    input: {},
    path: () => `/api/free/claim`,
    special: "start_free_status",
  },
  {
    name: "report_fix",
    title: "Report a fix",
    description:
      "WRITE. Tell RevealWhy a fix for a task is live: records what changed and when (status fixed, fix.owner_approval awaiting). Verification does NOT start yet: the owner sees \"Fix reported, awaiting your OK\" in RevealWhy and confirms or undoes it; you cannot confirm it for them. Once the owner confirms, the task moves to verifying: simulated users re-check the page within minutes (a simulation, not a result), then real visits before vs after the deploy are compared with control pages at 14 and 28 days (an A/B test result is never written over a fix under verification). The task ends verified, not_improved, inconclusive or not_enough_data. When the change touched several pages, list them in pages: each page gets its own before/after verdict (fix.pages) and the task's status is the roll-up (any page that fell → not_improved; every measured page rose → verified; pages with too few visits are named and left out). Optionally give commit_sha and pr_url. Call it only after the change is deployed, and tell the owner it is waiting for their OK. Needs a key with the write:findings scope.",
    scope: "write:findings",
    method: "POST",
    input: {
      id: z.string().min(1).describe("Task id (finding id)"),
      change_description: z.string().min(1).max(2000).describe("What was changed, in one or two sentences"),
      deployed_at: z.string().datetime({ offset: true }).optional().describe("When the change went live (ISO 8601); defaults to now"),
      commit_sha: z.string().regex(/^[0-9a-fA-F]{7,40}$/).optional().describe("The commit that carries the change"),
      pr_url: z.string().url().max(500).optional().describe("The pull request that carries the change (an https link on github.com or gitlab.com)"),
      pages: z.array(z.string().min(1).max(500)).max(10).optional().describe("The pages the change touched (URLs or paths, up to 10); each is measured on its own and the verdicts roll up"),
    },
    path: (pid, a) => `/api/projects/${enc(pid)}/findings/${enc(a.id)}/report-fix`,
    body: (a) => ({
      change_description: a.change_description,
      ...(a.deployed_at ? { deployed_at: a.deployed_at } : {}),
      ...(a.commit_sha ? { commit_sha: a.commit_sha } : {}),
      ...(a.pr_url ? { pr_url: a.pr_url } : {}),
      ...(a.pages?.length ? { pages: a.pages } : {}),
    }),
  },
  {
    name: "set_finding_status",
    title: "Set task status",
    description:
      "WRITE (a RevealWhy extension; not part of the shared agent-task contract). Move a task through the hand-off: sent_to_agent (you picked it up), fixed (use report_fix instead when you deployed a change; a key cannot set fixed on a task whose suggested_action.requiresHumanApproval is true, error requires_human_approval), dismissed (it does not apply), or open (put it back). Measured outcomes (verified, not_improved, inconclusive, not_enough_data) cannot be set; RevealWhy measures them. Needs a key with the write:findings scope.",
    scope: "write:findings",
    method: "PATCH",
    input: {
      id: z.string().min(1).describe("Task id (finding id)"),
      status: z.enum(["open", "sent_to_agent", "fixed", "dismissed"]).describe("New status"),
    },
    path: (pid, a) => `/api/projects/${enc(pid)}/findings/${enc(a.id)}`,
    body: (a) => ({ status: a.status }),
  },
  // ── Eye tracking (beta, paid plans) ──────────────────────────────────────────────────────────────────────────────
  {
    name: "get_eye_tracking_status",
    title: `${EYE_TRACKING_LABEL}: status`,
    description:
      `${EYE_TRACKING_LABEL}: can this project run webcam eye-tracking studies right now? Returns eyeTracking { entitled, enabled, available, reason }. reason says the missing step, in order: not_entitled (not on this plan: it is included on the paid plans), not_enabled (a project member turns it on in Settings → Eye tracking), not_ready (temporarily unavailable). Call this before create_gaze_study. Needs read:gaze.`,
    scope: "read:gaze",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/gaze/status`,
  },
  {
    name: "list_gaze_studies",
    title: `${EYE_TRACKING_LABEL}: camera studies`,
    description: `${EYE_TRACKING_LABEL}: the project's camera studies (the ones create_gaze_study makes): id, name, start URL, task, camera mode (off | required | optional) and audience. Their ids go to create_participant_links, get_gaze_quality and get_gaze_heatmap. Not the research studies of create_study / list_studies. Needs read:gaze.`,
    scope: "read:gaze",
    input: {},
    path: (pid) => `/api/projects/${enc(pid)}/studies`,
  },
  {
    name: "create_gaze_study",
    title: `${EYE_TRACKING_LABEL}: create a study`,
    description:
      `WRITE. Create a study that REQUIRES the camera, so every participant is eye-tracked (${EYE_TRACKING_LABEL}). Participants see one consent screen first (never pre-ticked); anyone who says no does not take part and nothing is recorded. The camera image never leaves their device. Ask the user who the participants are: only members of the public or the site's customers; never the user's own employees or students (refused). Refused with 409 eye_tracking_unavailable and the missing step when eye tracking is not available here (check get_eye_tracking_status first). Then call create_participant_links. Tell the user to say in their recruitment message, before anyone signs up: "This study uses your camera (eye tracking)." and that it works best on a laptop or desktop in Chrome (mobile is beta). Needs write:studies.`,
    scope: "write:studies",
    method: "POST",
    input: {
      name: z.string().min(1).max(200).describe("Study name, e.g. \"Checkout eye tracking\""),
      start_url: z.string().url().describe("The page participants start on (on the project's site)"),
      task: z.string().min(1).max(2000).describe("What participants are asked to do, in one or two sentences"),
      audience: z.enum(["general_public", "customers"]).describe("Who the participants are: members of the public, or the site's customers/users"),
    },
    path: (pid) => `/api/projects/${enc(pid)}/studies`,
    body: (a) => ({ name: a.name, startUrl: a.start_url, taskText: a.task, audience: a.audience, camera: "required" }),
  },
  {
    name: "create_participant_links",
    title: "Participant links",
    description:
      "WRITE. Create one short participant link per participant for a camera study from create_gaze_study or list_gaze_studies, not a research study from create_study (count 1–100; labels P1…PN unless you give one). domains: the site domains the study runs on (the start URL's host). Each link is for one person: share them individually. Needs write:studies.",
    scope: "write:studies",
    method: "POST",
    input: {
      study_id: z.string().min(1).describe("Camera study id (from create_gaze_study or list_gaze_studies)"),
      count: z.number().int().min(1).max(100).describe("How many participants"),
      domains: z.array(z.string().min(1).max(253)).min(1).max(20).describe("Site domains, e.g. [\"shop.example.com\"]"),
      label: z.string().max(40).optional().describe("Optional label prefix"),
    },
    path: (pid, a) => `/api/projects/${enc(pid)}/studies/${enc(a.study_id)}/links`,
    body: (a) => ({ count: a.count, domains: a.domains, ...(a.label ? { label: a.label } : {}) }),
  },
  {
    name: "get_gaze_quality",
    title: `${EYE_TRACKING_LABEL}: quality per participant`,
    description:
      `${EYE_TRACKING_LABEL}: per participant of a study, whether eye tracking ran (gaze status, with the reason when it failed), the tracking-quality band and the device (mobile is beta). Measured. Use it to say how many participants have usable gaze before quoting any gaze metric. Needs read:gaze.`,
    scope: "read:gaze",
    input: { study_id: z.string().min(1).describe("Camera study id (from list_gaze_studies)") },
    path: (pid, a) => `/api/projects/${enc(pid)}/studies/${enc(a.study_id)}/participants`,
  },
  {
    name: "get_gaze_metrics",
    title: `${EYE_TRACKING_LABEL}: element table for a page`,
    description:
      `${EYE_TRACKING_LABEL}: measured gaze per element of one page, pooled across every participant of ALL studies on that page (it takes no study id; for one study's per-element metrics use get_gaze_heatmap with study_id): time to first fixation, first-fixation duration, dwell (raw and quality-weighted), fixations, visits, revisits, share. Each row has a band (trustworthy / directional / not enough data); the page may abstain with a reason. Quote the band with every number and never present "not enough data" as a finding. Desktop only unless include_mobile. Needs read:gaze.`,
    scope: "read:gaze",
    input: {
      page: z.string().min(1).describe("Page URL"),
      include_mobile: z.boolean().optional().describe("Include mobile participants (beta)"),
    },
    path: (pid, a) => `/api/projects/${enc(pid)}/gaze/elements${qs({ page: a.page, includeMobile: a.include_mobile ? 1 : undefined })}`,
  },
  {
    name: "get_gaze_heatmap",
    title: `${EYE_TRACKING_LABEL}: heatmap for a page`,
    description:
      `${EYE_TRACKING_LABEL}: the measured gaze heatmap of one page (a grid in page pixels) with per-element metrics and the quality summary, optionally for one study's participants. When there is not enough data it abstains: no heatmap, only the reason (and maybe a preview labelled "not enough data for conclusions"). Measured, not predicted attention. Needs read:gaze.`,
    scope: "read:gaze",
    input: {
      page: z.string().min(1).describe("Page URL"),
      study_id: z.string().optional().describe("Only this camera study's participants (from list_gaze_studies)"),
      include_mobile: z.boolean().optional().describe("Include mobile participants (beta)"),
    },
    path: (pid, a) => `/api/projects/${enc(pid)}/gaze/heatmap${qs({ page: a.page, studyId: a.study_id, includeMobile: a.include_mobile ? 1 : undefined })}`,
  },
];

// ── Legacy marking: every tool from the earlier analytics product is flagged "legacy" ──────────────────────────────────────────
/**
 * The tools that still belong to the new flow's own story and are therefore NOT legacy: start_free(_status) (how a
 * person connects), the grounded visitor-behaviour findings and their fix lifecycle. Every other tool here is from the old
 * product: it keeps working and now says so in its description and its `legacy` flag. The new flow's tools are in
 * flow-tools.ts (setup, run, results, fixing, report, automate).
 */
export const NOT_LEGACY: ReadonlySet<string> = new Set(["add_product", "start_free", "start_free_status", "list_findings", "get_finding", "get_finding_evidence", "report_fix", "set_finding_status", "list_agent_tasks", "get_agent_task"]);
for (const t of TOOLS) {
  if (NOT_LEGACY.has(t.name)) continue;
  t.legacy = true;
  if (!t.description.startsWith("(legacy)")) t.description = `(legacy: the old product's tool, kept working; the new test flow has its own tools) ${t.description}`;
}

/** step 1: a product is made by a signed-in person; the free start is the way a coding agent asks for one. */
TOOLS.push({
  name: "add_product",
  title: "Add a product (free start)",
  description:
    "Step 1. A product is made by a person, never by a key (keys belong to one product). This starts a free project the person approves in the browser, then connects this session to it (same as start_free). The person then sets up the site in the app and gives the agent a key (Settings, Coding agents) with the permissions it needs.",
  scope: "none",
  method: "POST",
  input: {},
  path: () => "",
  special: "start_free",
});

