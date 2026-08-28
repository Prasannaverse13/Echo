/**
 * CLI entry for `pnpm run eval:recorder`.
 *
 * Runs the recorder eval harness against the configured Gemini model and
 * prints a per-fixture scorecard. Exits with a non-zero status code if
 * the average score is below `MIN_SCORE` (default 60).
 *
 * Usage:
 *   pnpm run eval:recorder                 # all fixtures
 *   pnpm run eval:recorder -- --only=1     # just the first fixture
 *   MIN_SCORE=80 pnpm run eval:recorder    # raise the bar
 */

import { runAllEvals } from "../src/lib/recorder/evals/run";

function parseOnly(): number | undefined {
  const idx = process.argv.indexOf("--only");
  if (idx < 0) return undefined;
  const v = process.argv[idx + 1];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

async function main() {
  const only = parseOnly();
  const minScore = Number(process.env.MIN_SCORE ?? 60);
  console.log(`▶ Recorder eval — ${only !== undefined ? `fixture #${only}` : "all fixtures"}`);
  console.log(`  model: gemini-3.5-flash`);
  console.log(`  min score: ${minScore}`);
  console.log("");

  const summary = await runAllEvals({ only });

  for (const f of summary.fixtures) {
    const pct = Math.round((f.total / f.max) * 100);
    const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
    console.log(`  ${bar} ${pct}%  ${f.name}`);
    console.log(`         tokens: ${f.breakdown.tokens ?? 0} · noForbidden: ${f.breakdown.noForbidden ?? 0} · tools: ${f.breakdown.tools ?? 0} · minSteps: ${f.breakdown.minSteps ?? 0} · generalization: ${f.breakdown.generalization ?? 0} · expectBrowser: ${f.breakdown.expectBrowser ?? 0}`);
    for (const n of f.notes) {
      console.log(`         ⚠ ${n}`);
    }
  }

  console.log("");
  console.log(`  Average: ${summary.average}% (${summary.fixtures.length} fixtures)`);
  console.log(`  Ran at:  ${summary.ranAt}`);
  console.log("");

  if (summary.average < minScore) {
    console.error(`✗ Below MIN_SCORE (${minScore})`);
    process.exit(1);
  }
  console.log(`✓ Passed MIN_SCORE (${minScore})`);
  process.exit(0);
}

main().catch((e) => {
  console.error("eval failed:", e);
  process.exit(1);
});
