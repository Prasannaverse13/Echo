/**
 * Verify the mock fallback path: with GCP disabled and no API key,
 * the routes must return the heuristic mock so the demo never breaks.
 */

const http = require("http");

function request(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let chunks = "";
        res.on("data", (d) => (chunks += d));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(chunks) });
          } catch {
            resolve({ status: res.statusCode, body: chunks });
          }
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log("=== Mock fallback smoke test ===\n");

  // 1. reconstruct
  const r1 = await request("/api/skills/reconstruct", "POST", {});
  console.log("reconstruct: status=" + r1.status + " source=" + r1.body.source);
  if (r1.status !== 200) { console.log("FAIL"); process.exit(1); }
  if (r1.body.source !== "mock") { console.log("FAIL: expected source=mock"); process.exit(1); }
  if (!r1.body.suggestedName) { console.log("FAIL: no suggestedName"); process.exit(1); }
  if (!r1.body.gcp || r1.body.gcp !== "disabled") { console.log("FAIL: expected gcp=disabled"); process.exit(1); }

  // 2. compose
  const r2 = await request("/api/agents/compose", "POST", {
    goal: "When a new hubspot lead arrives, enrich with linkedin and draft an outreach email",
  });
  console.log("compose:    status=" + r2.status + " source=" + r2.body.source);
  if (r2.status !== 200) { console.log("FAIL"); process.exit(1); }
  if (r2.body.source !== "mock") { console.log("FAIL: expected source=mock"); process.exit(1); }
  if (!r2.body.gcp || r2.body.gcp !== "disabled") { console.log("FAIL: expected gcp=disabled"); process.exit(1); }

  // 3. run
  const r3 = await request("/api/agents/run", "POST", { skillId: "x", inputs: [{ id: "a", payload: {} }] });
  console.log("run POST:   status=" + r3.status + " gcp=" + r3.body.gcp);
  if (r3.status !== 200) { console.log("FAIL"); process.exit(1); }
  if (r3.body.gcp !== "disabled") { console.log("FAIL: expected gcp=disabled"); process.exit(1); }

  console.log("\nPASS: all 3 routes return mock when GCP is disabled");
})().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
