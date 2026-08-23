// Test Firestore write directly
const {Firestore} = require("@google-cloud/firestore");

(async () => {
  const db = new Firestore({
    projectId: "echo-hackathon-2026",
    databaseId: "(default)",
  });
  const col = db.collection("skills");
  const ref = await col.add({
    testRun: true,
    message: "Hello from Echo",
    timestamp: new Date().toISOString(),
  });
  console.log("Wrote doc id:", ref.id);

  const snap = await col.limit(5).get();
  console.log("Found", snap.size, "docs in skills collection");
  snap.forEach((d) => {
    console.log(" -", d.id, "->", JSON.stringify(d.data()).slice(0, 100));
  });
})();
