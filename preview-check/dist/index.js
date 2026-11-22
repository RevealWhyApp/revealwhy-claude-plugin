"use strict";

// src/main.mjs
var import_node_fs = require("node:fs");
var MARKER = "<!-- revealwhy-preview-check -->";
var FIRST_WAIT_MS = 5e3;
var MAX_WAIT_MS = 3e4;
var DEFAULT_TIMEOUT_MIN = 30;
var input = (env, name) => String(env[`INPUT_${name.toUpperCase()}`] ?? "").trim();
var redact = (text, key) => key ? String(text).split(key).join("***").split(encodeURIComponent(key)).join("***") : String(text);
function baseOrigin(raw) {
  try {
    const u = new URL(raw);
    const local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    if (u.username || u.password) return null;
    if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
    return u.origin;
  } catch {
    return null;
  }
}
async function call(fetchImpl, url, init, key, limitMs = 6e4) {
  let res;
  try {
    res = await fetchImpl(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(Math.max(1, Math.min(6e4, limitMs))) });
  } catch {
    return { failed: true };
  }
  if (res.type === "opaqueredirect" || res.status >= 300 && res.status < 400) return { redirected: true };
  let json = null;
  try {
    json = JSON.parse(await res.text());
  } catch {
  }
  return { status: res.status, json, retryAfter: res.headers?.get?.("retry-after") ?? null, key };
}
function plain(text, max = 100) {
  let t = String(text ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]+/g, " ").replace(/`/g, "'").replace(/\s+/g, " ").trim();
  t = t.replace(/@/g, "@\u200B");
  if (t.length > max) t = `${t.slice(0, max - 1).trimEnd()}\u2026`;
  return `\`${t || "a goal"}\``;
}
function judge(test) {
  const results = Array.isArray(test?.results) ? test.results : [];
  const nameOf = (r) => plain(r?.result?.task?.name);
  const blocked = results.filter((r) => r?.result?.state === "blocked").map(nameOf);
  if (blocked.length) {
    return { result: "blocked", blocked, line: `A visitor got stuck on ${blocked.length === 1 ? "this goal" : "these goals"} in the preview: ${blocked.join("; ")}.` };
  }
  const states = results.map((r) => r?.result?.state);
  const fine = /* @__PURE__ */ new Set(["works", "effort", "does_not_fit"]);
  if (states.length && states.every((s) => fine.has(s))) {
    return { result: "works", blocked: [], line: `Test visitors reached ${states.length === 1 ? "the goal" : `all ${states.length} goals`} in the preview.` };
  }
  const refused = (test?.tasks ?? []).filter((t) => t?.state === "refused").length;
  const why = !states.length ? refused ? "RevealWhy could not start any of the goals on this preview." : "The test finished without a result." : "Not every goal could be checked, so there is no answer for this preview.";
  return { result: "could_not_tell", blocked: [], line: `We could not tell. ${why}` };
}
function message({ result, line, link, note }) {
  const head = result === "blocked" ? "RevealWhy found a break in this preview" : result === "works" ? "RevealWhy: this preview works" : "RevealWhy: we could not tell";
  const tail = result === "could_not_tell" ? " This does not fail your build." : "";
  return `${MARKER}
### ${head}

${line}${tail}${note ? `

${note}` : ""}${link ? `

[See the result in RevealWhy](${link})` : ""}
`;
}
async function publish({ env, fetchImpl, body, summaryPath, key }) {
  let commented = false;
  const token = input(env, "github-token") || String(env.GITHUB_TOKEN ?? "");
  const ghApi = baseOrigin(String(env.GITHUB_API_URL || "https://api.github.com"));
  let number = null;
  try {
    if (env.GITHUB_EVENT_PATH && (env.GITHUB_EVENT_NAME === "pull_request" || env.GITHUB_EVENT_NAME === "pull_request_target")) {
      number = JSON.parse((0, import_node_fs.readFileSync)(env.GITHUB_EVENT_PATH, "utf8"))?.pull_request?.number ?? null;
    }
  } catch {
    number = null;
  }
  if (token && ghApi && number && env.GITHUB_REPOSITORY) {
    const h = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "revealwhy-preview-check" };
    const base = `${ghApi}/repos/${env.GITHUB_REPOSITORY}/issues`;
    const list = await call(fetchImpl, `${base}/${number}/comments?per_page=100`, { headers: h }, token);
    if (list.status === 200 && Array.isArray(list.json)) {
      const mine = list.json.find((c) => typeof c?.body === "string" && c.body.startsWith(MARKER));
      const put = mine ? await call(fetchImpl, `${base}/comments/${mine.id}`, { method: "PATCH", headers: h, body: JSON.stringify({ body }) }, token) : await call(fetchImpl, `${base}/${number}/comments`, { method: "POST", headers: h, body: JSON.stringify({ body }) }, token);
      commented = put.status === 200 || put.status === 201;
    }
  }
  if (!commented && summaryPath) {
    try {
      (0, import_node_fs.appendFileSync)(summaryPath, `${body}
`);
    } catch {
    }
  }
  return commented;
}
async function run(deps = {}) {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const out = deps.out ?? ((s) => process.stdout.write(`${s}
`));
  const key = input(env, "revealwhy-key");
  if (key && !/[\r\n]/.test(key)) out(`::add-mask::${key}`);
  const say = (s) => out(redact(s, key));
  const previewUrl = input(env, "preview-url");
  const projectId = input(env, "project-id");
  const baseUrl = input(env, "base-url");
  const origin = baseUrl ? baseOrigin(baseUrl) : null;
  const timeoutMin = Math.min(60, Math.max(1, Number(input(env, "timeout-minutes")) || DEFAULT_TIMEOUT_MIN));
  const link = origin && projectId ? `${origin}/app/p/${encodeURIComponent(projectId)}/tasks` : origin ?? null;
  const finish = async (result, line, note, code) => {
    const body = message({ result, line, link, note });
    const commented = await publish({ env, fetchImpl, body: redact(body, key), summaryPath: env.GITHUB_STEP_SUMMARY, key });
    say(`RevealWhy preview check: ${result.replace(/_/g, " ")}${commented ? " (comment posted)" : ""}`);
    if (env.GITHUB_OUTPUT) {
      try {
        (0, import_node_fs.appendFileSync)(env.GITHUB_OUTPUT, `result=${result}
`);
      } catch {
      }
    }
    return { code, result };
  };
  const couldNot = (why, note) => finish("could_not_tell", `We could not tell. ${why}`, note, 0);
  if (!key) {
    return finish("could_not_tell", "Skipped: this run has no RevealWhy key. Pull requests from forks cannot read repository secrets, so the check did not run.", "If this is not a fork, set the input revealwhy-key from a repository secret.", 0);
  }
  if (!previewUrl || !projectId || !baseUrl) {
    return couldNot("The check is missing its project ID, the preview address or the base-url.", "Set the inputs project-id, preview-url and base-url in the workflow. Nothing was sent.");
  }
  if (!origin) return couldNot("The base-url is not a plain https address. Nothing was sent.");
  const headers = { "X-API-Key": key, Accept: "application/json", "User-Agent": "revealwhy-preview-check", "Content-Type": "application/json" };
  const root = `${origin}/api/projects/${encodeURIComponent(projectId)}/task-tests`;
  const stop = (r) => r.redirected ? couldNot("RevealWhy answered with a redirect, and the check never follows one with your key.") : null;
  const start = await call(fetchImpl, `${root}/preview`, { method: "POST", headers, body: JSON.stringify({ url: previewUrl }) }, key);
  const s0 = stop(start);
  if (s0) return s0;
  if (start.failed || start.status >= 500) return couldNot("RevealWhy did not answer just now.");
  if (start.status !== 202 && start.status !== 200) {
    const reason = typeof start.json?.error === "string" ? plain(start.json.error, 300) : `RevealWhy refused to start the check (${start.status}).`;
    return couldNot(reason, start.status === 401 || start.status === 403 ? "Check that the key is a RevealWhy key that may run tests, and that it belongs to this project." : void 0);
  }
  const testId = start.json?.test_id;
  if (typeof testId !== "string" || !/^tt_[0-9a-f]{24}$/.test(testId)) return couldNot("RevealWhy started a check but did not say which.");
  say(`Started the preview check (${testId}). Waiting for it.`);
  const deadline = now() + timeoutMin * 6e4;
  let wait = FIRST_WAIT_MS;
  for (; ; ) {
    const timedOut = () => couldNot(`The check was still running after ${timeoutMin} minutes.`, "It keeps going in RevealWhy; open the result there.");
    if (now() >= deadline) return timedOut();
    await sleep(Math.min(wait, deadline - now()));
    wait = Math.min(MAX_WAIT_MS, Math.round(wait * 1.5));
    if (now() >= deadline) return timedOut();
    const got = await call(fetchImpl, `${root}/${testId}`, { headers }, key, deadline - now());
    const s1 = stop(got);
    if (s1) return s1;
    if (got.failed || got.status >= 500 || got.status === 429) continue;
    if (got.status !== 200) return couldNot(typeof got.json?.error === "string" ? plain(got.json.error, 300) : `RevealWhy would not show the result (${got.status}).`);
    const status = got.json?.status;
    if (status === "running" || status === "stopping") continue;
    const j = judge(got.json);
    return finish(j.result, j.line, j.result === "blocked" ? "Your build is marked failed because of this." : void 0, j.result === "blocked" ? 1 : 0);
  }
}

// src/index.mjs
run().then(
  ({ code }) => {
    process.exitCode = code;
  },
  () => {
    process.stdout.write("RevealWhy preview check: we could not tell (an unexpected error on the check's side). This does not fail your build.\n");
    process.exitCode = 0;
  }
);
