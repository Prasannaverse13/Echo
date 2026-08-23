/**
 * Full smoke test for every AI-backed feature in Echo.
 * Hits the live API routes and reports pass/fail for each.
 */

const http = require("http");

function request(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: "localhost",
      port: 3000,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let chunks = "";
      res.on("data", (d) => (chunks += d));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(chunks) });
        } catch {
          resolve({ status: res.statusCode, body: chunks });
        }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("reconstruct: empty body (defaults)", async () => {
  const r = await request("/api/skills/reconstruct", "POST", {});
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  if (!r.body.suggestedName) throw new Error("missing suggestedName");
  if (!Array.isArray(r.body.steps) || r.body.steps.length < 3) throw new Error("bad steps");
  if (!["vertex", "aistudio", "mock"].includes(r.body.source)) throw new Error(`unknown source: ${r.body.source}`);
  return { source: r.body.source, name: r.body.suggestedName, steps: r.body.steps.length };
});

test("reconstruct: real-looking payload", async () => {
  const r = await request("/api/skills/reconstruct", "POST", { frameCount: 30, durationSec: 84 });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  if (r.body.source === "mock") throw new Error("expected real Gemini, got mock");
  return { source: r.body.source, name: r.body.suggestedName, integrations: r.body.integrations };
});

test("compose: 3-skill library", async () => {
  const r = await request("/api/agents/compose", "POST", {
    goal: "When a new HubSpot lead arrives, enrich with LinkedIn, draft outreach, and save to Gmail drafts",
    library: [
      { id: "hs", name: "HubSpot Lead Fetcher", description: "Fetches new leads from HubSpot" },
      { id: "li", name: "LinkedIn Lead Enricher", description: "Enriches contacts with LinkedIn data" },
      { id: "em", name: "Personalized Email Drafter", description: "Drafts personalized emails" },
      { id: "gm", name: "Gmail Drafter", description: "Saves drafts to Gmail" },
    ],
  });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  if (!Array.isArray(r.body.subtasks) || r.body.subtasks.length === 0) throw new Error("empty subtasks");
  if (r.body.source === "mock") throw new Error("expected real Gemini, got mock");
  return { source: r.body.source, subtasks: r.body.subtasks.length, time: r.body.totalEstTime };
});

test("compose: empty library uses default", async () => {
  const r = await request("/api/agents/compose", "POST", { goal: "Post weekly sales report to Slack" });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  return { source: r.body.source, subtasks: r.body.subtasks.length };
});

test("run: queue 3 inputs", async () => {
  const r = await request("/api/agents/run", "POST", {
    skillId: "test-skill",
    inputs: [
      { id: "a", payload: {} },
      { id: "b", payload: {} },
      { id: "c", payload: {} },
    ],
  });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  if (!r.body.runId) throw new Error("missing runId");
  if (r.body.status !== "queued") throw new Error(`expected queued, got ${r.body.status}`);
  if (r.body.gcp !== "connected") throw new Error(`expected gcp connected, got ${r.body.gcp}`);
  return { runId: r.body.runId, gcp: r.body.gcp, inputs: r.body.totalInputs };
});

test("run: poll progress (immediate after queue)", async () => {
  const queue = await request("/api/agents/run", "POST", { skillId: "x", inputs: [{ id: "a", payload: {} }] });
  if (queue.status !== 200) throw new Error(`queue ${queue.status}`);
  const runId = queue.body.runId;
  const r = await request(`/api/agents/run?id=${runId}`, "GET");
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  if (r.body.runId !== runId) throw new Error("runId mismatch");
  if (!["running", "completed"].includes(r.body.status)) throw new Error(`bad status ${r.body.status}`);
  return { runId, status: r.body.status, progress: r.body.progress, gcp: r.body.gcp };
});

test("compose: missing goal returns 400", async () => {
  const r = await request("/api/agents/compose", "POST", {});
  if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
  if (!r.body.error) throw new Error("missing error");
  return { status: r.status, error: r.body.error };
});

test("run: missing inputs returns 400", async () => {
  const r = await request("/api/agents/run", "POST", { skillId: "x" });
  if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
  return { status: r.status, error: r.body.error };
});

test("run: GET without id returns 400", async () => {
  const r = await request("/api/agents/run", "GET");
  if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
  return { status: r.status, error: r.body.error };
});

(async () => {
  let passed = 0, failed = 0;
  console.log("=== Echo AI feature smoke test ===\n");
  for (const t of tests) {
    try {
      const out = await t.fn();
      passed++;
      console.log("PASS " + t.name);
      if (out) console.log("     " + JSON.stringify(out));
    } catch (e) {
      failed++;
      console.log("FAIL " + t.name + " -> " + e.message);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total`);
  process.exit(failed > 0 ? 1 : 0);
})();
