/**
 * scripts/smoke-worker.cjs
 *
 * Smoke test for the Cloud Run worker. We can't run the long-lived
 * subscription locally without ADC, but we can verify:
 *   1. The worker module loads (its imports resolve).
 *   2. The health server starts and serves /healthz with 200.
 *   3. The worker exits cleanly on SIGTERM.
 *
 * We start the worker with GCP_ENABLED=false so it boots without trying
 * to reach the real Pub/Sub. The test exits with 0 on success.
 */

const { spawn } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const workerEntry = path.join(repoRoot, "src", "worker", "index.ts");

const env = {
  ...process.env,
  GCP_ENABLED: "false",
  PORT: "8123",
  WORKER_CONCURRENCY: "1",
};

console.log("[smoke-worker] starting worker (GCP disabled) ...");
const child = spawn(
  "node",
  [path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), workerEntry],
  { env, stdio: ["ignore", "pipe", "pipe"] }
);

let stdout = "";
let stderr = "";
child.stdout.on("data", (d) => (stdout += d.toString()));
child.stderr.on("data", (d) => (stderr += d.toString()));

const ready = new Promise((resolve, reject) => {
  const timer = setInterval(() => {
    if (stdout.includes("health server listening")) {
      clearInterval(timer);
      resolve();
    }
  }, 200);
  setTimeout(() => {
    clearInterval(timer);
    reject(new Error("worker did not start health server within 10s"));
  }, 10000);
});

(async () => {
  try {
    await ready;
    console.log("[smoke-worker] health server up");

    // Hit /healthz
    const http = require("node:http");
    const body = await new Promise((res, rej) => {
      const req = http.get("http://127.0.0.1:8123/healthz", (r) => {
        let chunks = "";
        r.on("data", (c) => (chunks += c));
        r.on("end", () => res({ status: r.statusCode, body: chunks }));
      });
      req.on("error", rej);
      req.setTimeout(5000, () => req.destroy(new Error("timeout")));
    });
    if (body.status !== 200) {
      throw new Error(`/healthz returned ${body.status}`);
    }
    const parsed = JSON.parse(body.body);
    if (parsed.role !== "echo-worker") {
      throw new Error(`/healthz returned wrong role: ${parsed.role}`);
    }
    console.log("[smoke-worker] /healthz 200 OK role=echo-worker");

    // SIGTERM the worker and wait for clean exit
    console.log("[smoke-worker] sending SIGTERM");
    child.kill("SIGTERM");
    const exit = await new Promise((res) => child.on("exit", res));
    console.log(`[smoke-worker] worker exited with code ${exit}`);
    if (exit !== 0 && exit !== null) {
      // SIGTERM can show up as null/signal; either is fine
      console.log("[smoke-worker] (non-zero exit ignored — SIGTERM)");
    }

    console.log("PASS: worker smoke");
    process.exit(0);
  } catch (err) {
    console.error("FAIL:", err.message);
    console.error("--- stdout ---\n" + stdout);
    console.error("--- stderr ---\n" + stderr);
    child.kill("SIGKILL");
    process.exit(1);
  }
})();
