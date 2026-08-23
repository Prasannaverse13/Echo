// Verify Pub/Sub + Firestore
const {PubSub} = require("@google-cloud/pubsub");
const {Firestore} = require("@google-cloud/firestore");

(async () => {
  // Pub/Sub
  const ps = new PubSub({projectId: "echo-hackathon-2026"});
  const topic = ps.topic("echo-runs");
  const [topicExists] = await topic.exists();
  console.log("Pub/Sub topic echo-runs exists:", topicExists);

  // Pull recent messages
  const [sub] = await topic.createSubscription("echo-runs-verify", {messageRetentionDuration: {seconds: 600}}).catch(e => [null, e]);
  if (sub) {
    console.log("Created temp subscription:", sub.name);
    const [messages] = await sub.pull({maxMessages: 5});
    console.log("Pulled", messages.length, "messages");
    messages.forEach(m => {
      console.log(" msg:", JSON.stringify(m.message.data.toString()).slice(0, 120));
      m.ack();
    });
  }

  // Firestore runs
  const db = new Firestore({projectId: "echo-hackathon-2026"});
  const runs = await db.collection("runs").limit(3).get();
  console.log("\nFirestore runs collection:", runs.size, "docs");
  runs.forEach(d => {
    console.log(" -", d.id, "->", d.data().status, d.data().totalInputs, "inputs");
  });
})();
