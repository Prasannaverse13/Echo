/**
 * Test the ADK LlmAgent (echo-agent.ts) — invoked when GCP is enabled
 * and a real Cloud Run worker pulls a run from Pub/Sub.
 */

require("dotenv").config({ path: ".env.local" });
process.env.GCP_ENABLED = "true";
process.env.GCP_PROJECT_ID = "echo-hackathon-2026";
process.env.GCP_VERTEX_LOCATION = "us-central1";
process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "C:\\Users\\Prasa\\AppData\\Local\\Packages\\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\\LocalCache\\Roaming\\gcloud\\application_default_credentials.json";

(async () => {
  // Use tsx to load the .ts directly
  require("child_process").execSync;
  const { register } = require("module");
  register("tsx/esm", import.meta.url);

  // ... actually easier: just require via tsx CLI
  console.log("Spawning tsx to run echo-agent in a child process...");
})();
