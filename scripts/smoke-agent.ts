/**
 * Smoke test for the ADK LlmAgent (src/lib/agents/echo-agent.ts).
 * Run with: pnpm exec tsx scripts/smoke-agent.ts
 */

import { runEchoAgent, isVertexAvailable, type AgentAction } from "../src/lib/agents/echo-agent";

const input = {
  runId: "smoke-test-1",
  skillId: "test-skill",
  inputId: "input-1",
  input: { customer: "ACME", amount: 1234 },
  skill: {
    suggestedName: "Invoice → Sheet",
    steps: [
      { num: 1, title: "Read invoice", detail: "Parse the PDF", at: "00:00" },
      { num: 2, title: "Append to sheet", detail: "Add a row to the Sheet", at: "00:30" },
    ],
  },
};

(async () => {
  console.log("=== Echo ADK agent smoke test ===\n");
  console.log("isVertexAvailable:", isVertexAvailable());
  console.log("GCP_PROJECT_ID:", process.env.GCP_PROJECT_ID);
  console.log();

  const actions: AgentAction[] = [];
  let final: AgentAction | undefined;
  for await (const action of runEchoAgent(input)) {
    actions.push(action);
    console.log("ACTION:", JSON.stringify(action).slice(0, 200));
    if (action.type === "final_answer") {
      final = action;
    }
  }

  console.log(`\nTotal actions: ${actions.length}`);
  console.log("Final answer:", final ? final.text : "(none)");

  if (actions.length < 2) {
    console.log("FAIL: expected at least 2 actions (initial + final)");
    process.exit(1);
  }
  if (!actions.some((a) => a.type === "thought")) {
    console.log("FAIL: expected at least one thought action");
    process.exit(1);
  }
  if (actions[actions.length - 1].type !== "final_answer") {
    console.log("FAIL: last action should be final_answer");
    process.exit(1);
  }

  console.log("\nPASS: ADK agent yielded thought + final_answer");
})().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
