/**
 * The new flow's tools in the order of the app's steps:
 * setup, run, results, fixing, report, automate. Every tool is a thin call to a route the app itself uses, through a
 * scoped product key, so it passes the same guards (tenant check, owner-granted key, the product's caps). There is no
 * new data path here.
 *
 * Rules the tools keep (each has a test in tests/unit/mcp-flow-tools.test.ts):
 *  - Passwords and sealed values never go in or out: no tool takes a password; make_tester asks RevealWhy to make the
 *    account and only RevealWhy testers can be made (an account of your own is added in the app).
 *  - No tool touches a live switch or a test-payment tick, and none confirms a task: those stay the owner's, in the app.
 *  - The estimate comes first: plan_test reads what a start would do, and start_test (and check_preview) refuse without
 *    the plan id it gave, and start exactly what that plan read.
 *  - Honest words: a result that is thin gives counts only; "could not tell" is never read as a pass; what a run went
 *    on without is "not checked", never a pass; test visitors are simulated and the output says so.
 *  - A ticket is previewed first (what leaves RevealWhy, masked) and sent only with the preview's hash.
 */
import { randomBytes } from "node:crypto";
import { z, type ZodRawShape } from "zod";
import type { Scope } from "./catalog.js";

export type ApiAnswer = { ok: true; data: any } | { ok: false; error: string };
export type FlowMethod = "GET" | "POST" | "PUT" | "PATCH";

/** What a flow tool runs with: a call to the API (data already fenced for untrusted text) and the plans read this session. */
export interface FlowCtx {
  api: (path: string, method?: FlowMethod, body?: Record<string, unknown>) => Promise<ApiAnswer>;
  projectId: string;
  plans: Map<string, Plan>;
  now: () => number;
}
export interface FlowResult { text: string; isError?: boolean }

export interface FlowTool {
  name: string;
  title: string;
  description: string;
  scope: Scope | "write:setup" | "write:accounts" | "write:tickets" | "write:confirm" | "write:fix_shipped" | "run:tests";
  write: boolean;
  input: ZodRawShape;
  run: (args: Record<string, any>, ctx: FlowCtx) => Promise<FlowResult>;
}

/** A plan read by plan_test, kept in this process only. */
export interface Plan {
  id: string;
  readAt: number;
  tasks: string[];
  devices: string[];
  visitors?: number;
  qaTester: boolean;
  leaveOut: string[];
  tries: number;
  minutes: number;
  capUsd: number;
}
export const PLAN_MAX_AGE_MS = 30 * 60_000;

const enc = encodeURIComponent;
const p = (pid: string) => `/api/projects/${enc(pid)}`;
const json = (d: unknown): string => JSON.stringify(d, null, 2);
const ok = (text: string): FlowResult => ({ text });
const bad = (text: string): FlowResult => ({ text, isError: true });
const fromApi = (a: ApiAnswer, show: (d: any) => string = json): FlowResult => (a.ok ? ok(show(a.data)) : bad(a.error));

const KIND_ID = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).describe("A kind of user's id: lower-case letters, digits and dashes");
const ENV_ID = z.string().regex(/^env_[a-f0-9]{24}$/).describe("A test copy's id (list_test_copies)");
const TASK_ID = z.string().regex(/^task_[a-f0-9]{24}$/).describe("A goal's (task's) id (list_test_goals)");
const ISSUE_ID = z.string().min(1).max(128).describe("A problem's id (list_test_issues)");
const TEST_ID = z.string().regex(/^tt_[a-f0-9]{24}$/).describe("A test's id (start_test, get_test_progress)");

// ── words the results keep (the server's states, in plain words; never upgraded) ─────────────────────────────────────
export const SIMULATED = "Test visitors are simulated: this shows what they did on your site, not what real visitors do, and it is not a guarantee.";
const STATE_WORDS: Record<string, string> = {
  works: "went through in the tries made",
  blocked: "visitors were blocked",
  does_not_fit: "does not fit the kind of user",
  effort: "took more effort than it should",
  partly_checked: "only part of it was checked",
  could_not_tell: "could not tell",
  not_reached: "not reached",
  did_not_run: "did not run",
  not_checked: "not checked yet",
  not_run: "not run yet",
};
/** A state that decided something. Anything else is shown as counts and reasons only, never as a pass or a fail. */
const DECIDED = new Set(["works", "blocked", "does_not_fit", "effort"]);

const countWords = (c: any): string => (c && Number.isFinite(c.k) && Number.isFinite(c.of) ? `${c.k} of ${c.of}` : "no count");

/** One task of the results, honest by construction: undecided states give counts only; could-not-tell says why; a partial check says so. */
export function taskLine(t: any): string {
  const name = t?.task?.name ?? t?.name ?? "A goal";
  const state: string = t?.state ?? "not_run";
  const words = STATE_WORDS[state] ?? "no reading";
  let line = `- ${name}: ${words}`;
  if (DECIDED.has(state)) line += ` (${countWords(t.count)} tries)`;
  else if (t?.count) line += ` (${countWords(t.count)} tries; too little to say more)`;
  const why = t?.couldNotTell;
  if (why && typeof why === "object") line += `. Could not tell in ${why.k ?? "some"} tries${why.why ? `, mostly because of ${why.why}` : ""}`;
  if (t?.notEverythingChecked || state === "partly_checked") line += ". Not everything was checked, so this is not a pass";
  return line;
}

// ── setup ────────────────────────────────────────────────────────────────────────────────────────────────────────
const setup: FlowTool[] = [
  {
    name: "get_ownership_record", title: "Ownership record for the site", scope: "read:findings", write: false, input: {},
    description: "Step 1. The record the site's owner publishes (a DNS record or a meta tag) so RevealWhy may test the site. Show it to the person: you cannot prove ownership for them. Then call check_ownership.",
    run: async (_a, c) => fromApi(await c.api(`${p(c.projectId)}/tests/site-verification`)),
  },
  {
    name: "check_ownership", title: "Check the ownership record", scope: "run:tests", write: true, input: {},
    description: "Step 1. Asks RevealWhy to look for the published record now. It only checks; it never marks a site as owned by itself. If it is not found yet, say so and wait for the person to publish it.",
    run: async (_a, c) => fromApi(await c.api(`${p(c.projectId)}/tests/site-verification/check`, "POST", {})),
  },
  {
    name: "list_test_copies", title: "Test copies of the site", scope: "write:setup", write: false, input: {},
    description: "Step 1. The product's test copies (a copy of the site made for testing) and where each stands. Test accounts and named things belong to a test copy.",
    run: async (_a, c) => fromApi(await c.api(`${p(c.projectId)}/environments`)),
  },
  {
    name: "add_test_copy", title: "Add a test copy", scope: "write:setup", write: true,
    input: { origin: z.string().min(1).max(300).describe("The test copy's address, e.g. https://staging.example.com"), name: z.string().min(1).max(100).optional().describe("A short name") },
    description: "Step 1. Adds a test copy by its address. This does not declare that it is a test copy and does not allow anything on it: the owner does that in the app. Never give a live site's address as a test copy.",
    run: async (a, c) => fromApi(await c.api(`${p(c.projectId)}/environments`, "POST", { origin: a.origin, ...(a.name ? { name: a.name } : {}) })),
  },
  {
    name: "list_kinds", title: "Kinds of user", scope: "read:findings", write: false, input: {},
    description: "Step 2. The kinds of user the product is tested as (who uses it), with their descriptions and how many profiles each has.",
    run: async (_a, c) => fromApi(await c.api(`${p(c.projectId)}/profiles`), (d) => json({ kinds: d?.kinds ?? [] })),
  },
  {
    name: "add_kind", title: "Add a kind of user", scope: "write:setup", write: true,
    input: { kind_id: KIND_ID, name: z.string().min(1).max(80).describe("One line, e.g. \"Hotel booker\". Never a real person's name."), signs_in: z.boolean().describe("Whether this kind signs in"), description: z.string().max(2000).optional().describe("Who they are, in plain words. No personal data.") },
    description: "Step 2. Adds a kind of user. Test visitors of this kind are simulated; the description steers them. Never put a real person's data in it.",
    run: async (a, c) => fromApi(await c.api(`${p(c.projectId)}/kinds-of-user`, "POST", { kind_id: a.kind_id, name: a.name, signs_in: a.signs_in, ...(a.description ? { description: a.description } : {}) })),
  },
  {
    name: "describe_kind", title: "Describe a kind of user", scope: "write:setup", write: true,
    input: { kind_id: KIND_ID, description: z.string().min(1).max(2000).describe("Who they are, in plain words. No personal data.") },
    description: "Step 2. Writes a new version of a kind's description.",
    run: async (a, c) => fromApi(await c.api(`${p(c.projectId)}/kinds-of-user/${enc(a.kind_id)}/description`, "PUT", { description: a.description })),
  },
  {
    name: "set_trait_card", title: "Set a trait on a kind's card", scope: "write:setup", write: true,
    input: { kind_id: KIND_ID, trait: z.string().min(1).max(40).describe("A trait code from the kind's card"), value: z.any().describe("The value, or null for not known") },
    description: "Step 2. Sets one trait on a kind's card, marked as set by your agent. It cannot set accessibility needs and cannot replace a trait the owner set.",
    run: async (a, c) => fromApi(await c.api(`${p(c.projectId)}/kinds-of-user/${enc(a.kind_id)}/card/traits/${enc(a.trait)}`, "PUT", { value: a.value ?? null })),
  },
  {
    name: "suggest_test_goals", title: "Suggest goals for a kind of user", scope: "write:setup", write: true,
    input: { kind_id: KIND_ID.optional(), job_id: z.string().optional().describe("Pass the job_id from the first call to read the answer") },
    description: "Step 3. Asks for goal ideas for a kind of user (uses the model, within the product's caps). Call once with kind_id, then again with job_id until it is ready. Suggestions are only ideas: nothing is ticked or added until you call add_test_goal for the ones chosen. (The older suggest_goals tool is for conversion goals.)",
    run: async (a, c) => {
      if (a.job_id) {
        const r = await c.api(`${p(c.projectId)}/goals/suggest/${enc(a.job_id)}`);
        return fromApi(r, (d) => d?.state === "ready"
          ? json({ state: "ready", suggestions: (d.goals ?? []).map((g: string) => ({ goal: g, ticked: false })), note: "Ideas only. None is added or ticked. Add the chosen ones with add_test_goal." })
          : json(d));
      }
      if (!a.kind_id) return bad("Give kind_id to ask for suggestions, or job_id to read an answer.");
      return fromApi(await c.api(`${p(c.projectId)}/goals/suggest`, "POST", { kind_id: a.kind_id }));
    },
  },
  {
    name: "add_test_goal", title: "Add a goal", scope: "write:setup", write: true,
    input: { name: z.string().min(1).max(200).describe("The goal in the user's words, e.g. \"Book a room\""), kind_id: KIND_ID.describe("The kind of user this goal is for"), audience: z.string().max(60).optional().describe("A role name, or leave out for anyone") },
    description: "Step 3. Adds a goal (a task) for a kind of user. It is a draft: its steps are confirmed before any test uses it, by the owner in the app, or with confirm_test_goal when the owner gave this key that permission.",
    run: async (a, c) => fromApi(await c.api(`${p(c.projectId)}/tasks`, "POST", { name: a.name, kind_id: a.kind_id, ...(a.audience ? { audience: a.audience } : {}) })),
  },
  {
    name: "list_test_goals", title: "Goals of the product", scope: "write:setup", write: false, input: {},
    description: "Step 3. The product's goals (tasks), each with its kind of user and whether it is confirmed. Only confirmed goals can be tested. (The older list_goals tool is for conversion goals.)",
    run: async (_a, c) => fromApi(await c.api(`${p(c.projectId)}/tasks`)),
  },
  {
    // Review 944 (coordinator ruling 22 Nov): write:confirm, its own opt-in. Bound to the exact hash shown.
    name: "confirm_test_goal", title: "Confirm a goal's steps", scope: "write:confirm", write: true,
    input: {
      task_id: TASK_ID,
      version: z.number().int().min(1).optional().describe("The version of the goal's steps; leave out for the newest"),
      confirmation_hash: z.string().regex(/^[a-f0-9]{64}$/).optional().describe("The confirmation_hash from the steps you showed the person. Leave out to read the steps first."),
    },
    description: "Step 3. Confirms one version of a goal's steps so paid tests may run it. Call first WITHOUT confirmation_hash: it returns the steps in plain words, where they run and the confirmation_hash, and confirms nothing. Show the steps to the person, then call again with that version and hash. If the steps or where they run changed since, it is refused: read again. Only on a product whose site is proved, and only with a key the owner gave the confirm permission. The owner sees it as confirmed by your coding agent and can withdraw it.",
    run: async (a, c) => {
      const base = `${p(c.projectId)}/tasks/${enc(a.task_id)}`;
      if (a.confirmation_hash && !a.version) return bad("Send the version you read with its confirmation_hash.");
      let version: number | undefined = a.version;
      if (!version) {
        const t = await c.api(base);
        if (!t.ok) return bad(t.error);
        const vs = ((t.data?.versions ?? []) as any[]).map((v) => Number(v?.version)).filter((n) => Number.isInteger(n) && n > 0);
        if (!vs.length) return bad("This goal has no steps yet. The owner writes them in the app.");
        version = Math.max(...vs);
      }
      if (!a.confirmation_hash) {
        const r = await c.api(`${base}/versions/${version}`);
        return fromApi(r, (d) => json({
          task_id: a.task_id, version: d?.version, runs_on: d?.origin ?? null, plain_words: d?.plain_words ?? [],
          already_confirmed: d?.is_the_confirmed_version === true && d?.confirmation_holds !== false,
          confirmation_hash: d?.confirmation_hash ?? null, confirmed: false,
          next: d?.confirmation_hash
            ? `Nothing was confirmed. Show the person these steps, then call confirm_test_goal again with version ${d?.version} and confirmation_hash "${d.confirmation_hash}".`
            : "These steps have no site to run on yet, so they cannot be confirmed.",
        }));
      }
      const r = await c.api(`${base}/versions/${version}/confirm`, "POST", { confirmation_hash: a.confirmation_hash });
      return fromApi(r, (d) => json({ task_id: a.task_id, version: d?.version, confirmed: true, confirmed_by: d?.confirmed_by ?? "agent", note: "Confirmed. The owner sees it as confirmed by your coding agent and can withdraw it." }));
    },
  },
  {
    name: "make_tester", title: "Make a RevealWhy tester", scope: "write:accounts", write: true,
    input: {
      label: z.string().min(1).max(60).describe("Who uses the address, e.g. \"Hotel 1\""),
      environment_id: ENV_ID,
      kind_id: KIND_ID.describe("The kind of user the tester signs in as"),
      sign_in_url: z.string().min(1).max(500).describe("The sign-in page on that test copy"),
    },
    description: "Step 4. Makes a RevealWhy tester: a RevealWhy mailbox address and an account RevealWhy creates on the test copy. RevealWhy keeps the user name and password; this tool never asks for or returns one. It makes RevealWhy testers only: an account of your own is added by the owner in the app.",
    run: async (a, c) => fromApi(
      await c.api(`${p(c.projectId)}/inbox/addresses`, "POST", { label: a.label, environment_id: a.environment_id, make_account: { kind_id: a.kind_id, sign_in_url: a.sign_in_url } }),
      (d) => json({ id: d?.id, label: d?.label, address: d?.address, environment_id: d?.environment_id, test_account: d?.test_account ? { role: d.test_account.role, kind_id: d.test_account.kind_id, sign_in_url: d.test_account.sign_in_url } : undefined, note: "RevealWhy made and keeps the account's sign-in. It is never shown." }),
    ),
  },
  {
    name: "list_testers", title: "RevealWhy testers", scope: "write:accounts", write: false, input: {},
    description: "Step 4. The product's RevealWhy addresses (testers), masked. No passwords or sealed values are ever returned.",
    run: async (_a, c) => fromApi(await c.api(`${p(c.projectId)}/inbox/addresses`)),
  },
  {
    name: "name_test_thing", title: "Name things on a test copy", scope: "write:setup", write: true,
    input: { environment_id: ENV_ID, items: z.array(z.object({ label: z.string().min(1).max(40), name: z.string().min(1).max(80), ref: z.string().min(1).max(64) })).max(50).describe("Things on the test copy that tests may use: label (what it is, e.g. hotel), name, and its id on the test copy") },
    description: "Names the things on a test copy that tests may use (test copy only). It replaces the copy's whole list, so send the full list; read it first with list_test_things.",
    run: async (a, c) => fromApi(await c.api(`${p(c.projectId)}/environments/${enc(a.environment_id)}/named-entities`, "PUT", { items: a.items })),
  },
  {
    name: "list_test_things", title: "Named things on a test copy", scope: "write:setup", write: false, input: { environment_id: ENV_ID },
    description: "The things named on a test copy.",
    run: async (a, c) => fromApi(await c.api(`${p(c.projectId)}/environments/${enc(a.environment_id)}/named-entities`)),
  },
];

// ── run ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const DEVICES = z.array(z.string().min(1).max(40)).max(8).optional().describe("Screen sizes to test on (leave out for the default)");
const VISITORS = z.union([z.literal(1), z.literal(3), z.literal(5)]).optional().describe("Test visitors for each goal: 1, 3 or 5");

const run: FlowTool[] = [
  {
    name: "plan_test", title: "Plan a test: read the estimate", scope: "run:tests", write: false,
    input: { tasks: z.array(TASK_ID).max(20).optional().describe("Goals to test (leave out for every confirmed goal)"), devices: DEVICES, visitors: VISITORS, qa_tester: z.boolean().optional().describe("Add the careful tester"), leave_out: z.array(KIND_ID).max(10).optional().describe("Kinds of user to leave out") },
    description: "Step 5. Reads what a test would do now, with every refusal: tries, minutes, money (the most it can spend), screen sizes, visitors and the month's spending. Nothing is started and no money is held. You must read this and show the estimate to the person BEFORE start_test, which needs the plan_id this gives.",
    run: async (a, c) => {
      let ids: string[] | undefined = a.tasks;
      if (!ids) {
        const l = await c.api(`${p(c.projectId)}/tasks`);
        if (!l.ok) return bad(`${l.error} (plan_test reads the goals to plan with; pass tasks to plan specific goals, or use a key that may read setup.)`);
        ids = (l.data?.tasks ?? []).filter((t: any) => t.confirmation === "confirmed").map((t: any) => t.id);
        if (!ids!.length) return bad("No goal is confirmed yet. The owner confirms a goal in the app after its steps are written; only confirmed goals can be tested.");
      }
      const q = `?${[a.devices?.length ? `devices=${enc(a.devices.join(","))}` : "", a.visitors ? `visitors=${a.visitors}` : "", a.qa_tester ? "qa_tester=1" : ""].filter(Boolean).join("&")}`;
      const rows: any[] = [];
      for (const id of ids!) {
        const r = await c.api(`${p(c.projectId)}/tasks/${enc(id)}/runs/plan${q === "?" ? "" : q}`);
        if (!r.ok) return bad(r.error);
        rows.push({ id, ...r.data });
      }
      const ready = rows.filter((r) => r.can_start === true);
      const tries = ready.reduce((n, r) => n + (Number(r.planned_attempts) || 0), 0);
      const minutes = ready.reduce((n, r) => n + (Number(r.max_minutes) || 0), 0);
      const capUsd = ready.reduce((n, r) => n + (Number(r.cap_usd) || 0), 0);
      const devices = [...new Set(ready.flatMap((r) => (r.sides ?? []).flatMap((s: any) => (s.attempts ?? []).map((x: any) => x.device).filter(Boolean))))] as string[];
      const month = rows.find((r) => r.month)?.month ?? null;
      const refused = rows.filter((r) => r.can_start !== true).map((r) => ({ task_id: r.id, refusals: (r.refusals ?? []).map((x: any) => ({ code: x.code, error: x.error })) }));
      let plan_id: string | null = null;
      if (ready.length) {
        plan_id = `plan_${randomBytes(9).toString("hex")}`;
        c.plans.set(plan_id, { id: plan_id, readAt: c.now(), tasks: ready.map((r) => r.id), devices: a.devices ?? [], ...(a.visitors ? { visitors: a.visitors } : {}), qaTester: a.qa_tester === true, leaveOut: a.leave_out ?? [], tries, minutes, capUsd });
      }
      return ok(json({
        plan_id,
        can_start: ready.length > 0,
        estimate: ready.length ? { goals: ready.length, tries, minutes_at_most: minutes, money_at_most_usd: Number(capUsd.toFixed(2)), devices, visitors_per_goal: a.visitors ?? "default", careful_tester: a.qa_tester === true } : null,
        month,
        not_started: refused,
        not_checked: ready.flatMap((r) => (r.not_checked ? [{ task_id: r.id, not_checked: r.not_checked }] : [])),
        next: ready.length
          ? "Show the person this estimate. Then start_test with this plan_id. start_test starts exactly these goals with exactly these options."
          : "Nothing can start. Fix the refusals above (each says what to do), then plan_test again.",
        words: SIMULATED,
      }));
    },
  },
  {
    name: "start_test", title: "Start the test", scope: "run:tests", write: true,
    input: { plan_id: z.string().min(1).describe("The plan_id from plan_test (required)") },
    description: "Step 5. Starts the test planned by plan_test: exactly the goals and options that plan read, with the same caps and refusals as the app. Refused without a plan_id from plan_test in this session (or when the plan is more than 30 minutes old: plan again). It cannot turn on a live-site switch or a test-payment tick; those are the owner's, in the app.",
    run: async (a, c) => {
      const plan = c.plans.get(a.plan_id);
      if (!plan) return bad("start_test needs the plan_id from plan_test. Run plan_test first, show the person the estimate, then start with its plan_id.");
      if (c.now() - plan.readAt > PLAN_MAX_AGE_MS) { c.plans.delete(plan.id); return bad("That plan is more than 30 minutes old, so what it read may have changed. Run plan_test again."); }
      const r = await c.api(`${p(c.projectId)}/task-tests`, "POST", { tasks: plan.tasks, ...(plan.devices.length ? { devices: plan.devices } : {}), ...(plan.visitors ? { visitors: plan.visitors } : {}), ...(plan.qaTester ? { qa_tester: true } : {}), ...(plan.leaveOut.length ? { leave_out: plan.leaveOut } : {}) });
      if (r.ok) c.plans.delete(plan.id); // a plan starts one test
      return fromApi(r, (d) => json({ ...d, next: "Call get_test_progress with this test_id. The results are in the app as soon as it ends." }));
    },
  },
  {
    name: "stop_test", title: "Stop a test", scope: "run:tests", write: true, input: { test_id: TEST_ID },
    description: "Stops a running test. Tries already made are kept.",
    run: async (a, c) => fromApi(await c.api(`${p(c.projectId)}/task-tests/${enc(a.test_id)}/stop`, "POST", {})),
  },
  {
    name: "get_test_progress", title: "Test progress", scope: "read:findings", write: false, input: { test_id: TEST_ID.optional() },
    description: "How a test is going (one test, or the product's recent tests and their progress when test_id is left out).",
    run: async (a, c) => fromApi(await c.api(a.test_id ? `${p(c.projectId)}/task-tests/${enc(a.test_id)}` : `${p(c.projectId)}/task-tests/progress`)),
  },
  {
    name: "check_preview", title: "Test a preview of the site", scope: "run:tests", write: true,
    input: { plan_id: z.string().min(1).describe("A plan_id from plan_test for the same goals (required: a preview test costs money too)"), url: z.string().min(1).max(500).describe("The preview's address; its host must be one the owner has proved") },
    description: "Automate. Runs the planned goals against a preview address (for example a pull request's preview) as a paid test, at most one every 10 minutes. Needs a plan_id from plan_test, like start_test. Not for the live site: it is refused unless the owner proved the host.",
    run: async (a, c) => {
      const plan = c.plans.get(a.plan_id);
      if (!plan) return bad("check_preview needs the plan_id from plan_test: read the estimate first.");
      if (c.now() - plan.readAt > PLAN_MAX_AGE_MS) { c.plans.delete(plan.id); return bad("That plan is more than 30 minutes old. Run plan_test again."); }
      const r = await c.api(`${p(c.projectId)}/task-tests/preview`, "POST", { url: a.url, tasks: plan.tasks });
      if (r.ok) c.plans.delete(plan.id);
      return fromApi(r);
    },
  },
];

// ── results ──────────────────────────────────────────────────────────────────────────────────────────────────────
const results: FlowTool[] = [
  {
    name: "get_test_results", title: "Test results", scope: "read:findings", write: false,
    input: { task_id: TASK_ID.optional().describe("One goal, opened by step"), test_id: TEST_ID.optional().describe("With task_id: that test's own run of the goal") },
    description: `Results of the tests, in the app's own words. Thin results give counts only; "could not tell" is never a pass; a goal that was only partly checked says so. ${SIMULATED}`,
    run: async (a, c) => {
      if (a.test_id && !a.task_id) return bad("test_id goes with task_id: it opens that test's run of one goal.");
      if (a.task_id) return fromApi(await c.api(`${p(c.projectId)}/task-results/${enc(a.task_id)}${a.test_id ? `?test_id=${enc(a.test_id)}` : ""}`));
      return fromApi(await c.api(`${p(c.projectId)}/task-results`), (d) => [
        `Results for ${d?.product?.name ?? "the product"}. ${SIMULATED}`,
        ...((d?.tasks ?? []) as any[]).map(taskLine),
        d?.truncated ? "(More goals exist than are listed.)" : "",
      ].filter(Boolean).join("\n"));
    },
  },
  {
    name: "list_test_issues", title: "Problems found", scope: "read:findings", write: false,
    input: { status: z.string().optional().describe("Comma-separated statuses"), severity: z.string().optional(), limit: z.number().int().min(1).max(100).optional() },
    description: "Problems the tests found (the new flow's findings), each with an id for get_test_issue. (The older list_findings tool is for visitor-behaviour findings.)",
    run: async (a, c) => {
      const q = [a.status ? `status=${enc(a.status)}` : "", a.severity ? `severity=${enc(a.severity)}` : "", a.limit ? `limit=${a.limit}` : ""].filter(Boolean).join("&");
      return fromApi(await c.api(`${p(c.projectId)}/tests/issues${q ? `?${q}` : ""}`));
    },
  },
  {
    name: "get_test_issue", title: "One problem found", scope: "read:findings", write: false, input: { issue_id: ISSUE_ID },
    description: "One problem with its steps and what was seen. Pictures and recordings are not sent to keys: the person opens them in the app.",
    run: async (a, c) => fromApi(await c.api(`${p(c.projectId)}/tests/issues/${enc(a.issue_id)}`), (d) => json({ ...d, pictures: "Not sent to keys. Open the problem in the app to see its pictures." })),
  },
  {
    name: "why_could_not_tell", title: "Why a goal could not be told", scope: "read:findings", write: false, input: { task_id: TASK_ID, test_id: TEST_ID.optional() },
    description: "For a goal that read \"could not tell\": its reading, how many tries could not tell, and at which steps. It is not a pass and not a failure of the site. The reason for each try is in the app.",
    run: async (a, c) => {
      const r = await c.api(`${p(c.projectId)}/task-results/${enc(a.task_id)}${a.test_id ? `?test_id=${enc(a.test_id)}` : ""}`);
      if (!r.ok) return bad(r.error);
      // The route returns TaskOpened (shared/results/types.ts): the reading is on d.task (review 944 MUST 3).
      const t = r.data?.task ?? {};
      const state: string | null = typeof t.state === "string" ? t.state : null;
      const tries: number = Number(t.notCounted?.could_not_tell ?? 0) || 0;
      const steps = ((r.data?.steps ?? []) as any[])
        .map((s) => ({
          stage: s?.stage, step: s?.name, stepNo: s?.stepNo,
          tries: ((s?.marks ?? []) as any[]).reduce((n, m) => n + ((m?.squares ?? []) as any[]).filter((q) => q?.mark === "could_not_tell").length, 0),
        }))
        .filter((s) => s.tries > 0);
      const couldNotTell = state === "could_not_tell" || tries > 0 || steps.length > 0;
      return ok(json({
        task_id: a.task_id,
        state,
        reading: state ? (STATE_WORDS[state] ?? "no reading") : "no reading",
        could_not_tell_tries: tries,
        not_everything_checked: t.notEverythingChecked === true,
        steps,
        note: couldNotTell
          ? "Could not tell is never a pass. It means the tries did not show either way. The reason for each try is shown in the app."
          : "Nothing in this goal's tries read \"could not tell\".",
      }));
    },
  },
];

// ── fixing ───────────────────────────────────────────────────────────────────────────────────────────────────────
const HASH = z.string().regex(/^[a-f0-9]{16,128}$/i).optional().describe("The hash from the preview you showed the person. Leave out to get the preview first.");
function ticketTool(to: "github" | "notion"): FlowTool {
  const Place = to === "github" ? "GitHub" : "Notion";
  return {
    name: `send_to_${to}`, title: `Send a problem to ${Place}`, scope: "write:tickets", write: true, input: { issue_id: ISSUE_ID, hash: HASH },
    description: `Fixing. Sends one problem to the product's ${Place} as a ticket. Call first WITHOUT hash: it returns the preview (what leaves RevealWhy, masked, and what never does) and its hash, and sends nothing. Show it to the person, then call again with the hash to send. If what would be sent changed since, the send is refused: preview again. The ticket is attributed to the owner who gave this key.`,
    run: async (a, c) => {
      const base = `${p(c.projectId)}/tests/issues/${enc(a.issue_id)}`;
      if (!a.hash) {
        const pre = await c.api(`${base}/outbound?to=${to}`);
        return fromApi(pre, (d) => json({ ...d, sent: false, next: `Nothing was sent. Show the person the preview, then call send_to_${to} again with hash "${d?.hash}".` }));
      }
      const r = await c.api(`${base}/${to}`, "POST", { hash: a.hash });
      return fromApi(r, (d) => json({ ...d, sent: true }));
    },
  };
}
const fixing: FlowTool[] = [
  ticketTool("github"),
  ticketTool("notion"),
  {
    name: "mark_fix_shipped", title: "Report that a fix is shipped", scope: "write:fix_shipped", write: true, input: { issue_id: ISSUE_ID },
    description: "Fixing. Says a fix for one problem has been deployed to the tested site. It only marks the fix shipped (never dismisses or resolves the problem); then call retest. Needs a key given the fix-shipped permission by the owner. (The older report_fix tool is for visitor-behaviour findings.)",
    run: async (a, c) => fromApi(await c.api(`${p(c.projectId)}/tests/issues/${enc(a.issue_id)}/fix-shipped`, "POST", {})),
  },
  {
    name: "retest", title: "Test the fixed problems again", scope: "run:tests", write: true, input: { issue_ids: z.array(ISSUE_ID).min(1).max(10).describe("The problems to test again") },
    description: "Fixing. Tests again the problems whose fix is shipped, on the site as it is now. Same caps and refusals as the app. Read the result with get_test_issue; a problem is resolved only when the re-test says so.",
    run: async (a, c) => fromApi(await c.api(`${p(c.projectId)}/tests/retests`, "POST", { issue_ids: a.issue_ids })),
  },
];

// ── report ───────────────────────────────────────────────────────────────────────────────────────────────────────
export function reportMarkdown(product: string, results: any, issues: any[], today: string): string {
  const tasks: any[] = results?.tasks ?? [];
  const byState: Record<string, number> = {};
  for (const t of tasks) byState[t.state] = (byState[t.state] ?? 0) + 1;
  const lines = [
    `# Test report: ${product}`,
    "",
    `_${today}. ${SIMULATED}_`,
    "",
    "## Goals",
    "",
    ...(tasks.length ? tasks.map(taskLine) : ["No goal has been tested yet."]),
    "",
    "## In short",
    "",
    tasks.length ? Object.entries(byState).map(([s, n]) => `- ${n} ${n === 1 ? "goal" : "goals"}: ${STATE_WORDS[s] ?? s}`).join("\n") : "- Nothing to count yet.",
    "",
    "## Problems found",
    "",
    ...(issues.length ? issues.map((i) => `- ${i.title ?? i.id}${i.severity ? ` (${i.severity})` : ""}${i.status ? `, ${i.status}` : ""} [id ${i.id}]`) : ["None listed."]),
    "",
    "A goal that could not be told, or was only partly checked, is not a pass. This is not an accessibility audit or a certification.",
  ];
  return lines.join("\n");
}
const report: FlowTool[] = [
  {
    name: "get_test_report", title: "Test report (markdown)", scope: "read:findings", write: false, input: {},
    description: "Report. The tests' results and problems as one markdown report, from the same reads the app shows (no other source). Honest the same way: counts only where thin, could-not-tell is never a pass.",
    run: async (_a, c) => {
      const r = await c.api(`${p(c.projectId)}/task-results`);
      if (!r.ok) return bad(r.error);
      const i = await c.api(`${p(c.projectId)}/tests/issues?limit=100`);
      if (!i.ok) return bad(i.error);
      return ok(reportMarkdown(r.data?.product?.name ?? "the product", r.data, i.data?.issues ?? [], new Date(c.now()).toISOString().slice(0, 10)));
    },
  },
];

// ── automate ─────────────────────────────────────────────────────────────────────────────────────────────────────
const automate: FlowTool[] = [
  {
    name: "list_schedules", title: "Test schedules", scope: "read:findings", write: false, input: {},
    description: "Automate. The product's test schedules (weekly, and after a release).",
    run: async (_a, c) => fromApi(await c.api(`${p(c.projectId)}/task-schedules`)),
  },
  {
    name: "set_schedule", title: "Set a test schedule", scope: "write:setup", write: true,
    input: { kind: z.enum(["weekly", "after_release"]), weekday: z.number().int().min(0).max(6).optional().describe("Weekly: 0 is Sunday"), hour: z.number().int().min(0).max(23).optional().describe("Weekly: the hour, UTC"), tasks: z.array(TASK_ID).max(20).optional().describe("Goals to test (leave out for every confirmed goal)") },
    description: "Automate. Sets a weekly test or a test after each release. Each scheduled test spends within the product's caps and shows in the app like any other. Pause it with pause_schedule.",
    run: async (a, c) => {
      if (a.kind === "weekly" && (a.weekday === undefined || a.hour === undefined)) return bad("A weekly schedule needs weekday (0 to 6) and hour (0 to 23, UTC).");
      const body = a.kind === "weekly" ? { weekday: a.weekday, hour: a.hour, ...(a.tasks ? { tasks: a.tasks } : {}) } : { ...(a.tasks ? { tasks: a.tasks } : {}) };
      return fromApi(await c.api(`${p(c.projectId)}/task-schedules/${a.kind}`, "PUT", body));
    },
  },
  {
    name: "pause_schedule", title: "Pause a test schedule", scope: "write:setup", write: true, input: { kind: z.enum(["weekly", "after_release"]) },
    description: "Automate. Pauses a schedule. It can only pause: starting it again, and removing it, are the owner's in the app.",
    run: async (a, c) => fromApi(await c.api(`${p(c.projectId)}/task-schedules/${a.kind}`, "PATCH", { enabled: false })),
  },
];

export const FLOW_TOOLS: FlowTool[] = [...setup, ...run, ...results, ...fixing, ...report, ...automate];
/** The order of the app's steps, for the plugin skill and the catalog's listing. */
export const FLOW_STEPS = { setup: setup.map((t) => t.name), run: run.map((t) => t.name), results: results.map((t) => t.name), fixing: fixing.map((t) => t.name), report: report.map((t) => t.name), automate: automate.map((t) => t.name) } as const;
