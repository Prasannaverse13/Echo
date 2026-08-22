# Echo — 4-minute demo script

> For the All Things Agentic Hackathon submission. Film screen + voiceover.

---

## Cold open (0:00 – 0:15)

**Visuals:** Landing page hero, slow pan down. The `Echo*` word at the top is doing its `WordsPullUp` reveal animation. The cinematic video background plays behind the editorial Playfair Display headlines.

**Voiceover:**

> *"You do a workflow once. Echo watches, learns, and does it a thousand times for you — no APIs, no code, no setup."*

---

## Scene 1 — The hook (0:15 – 0:45)

**Visuals:** Cut to `/record`. Click *Record*. Browser shows the screen-picker UI. Pick the current tab. The capture dots animate in the top-right. (30 seconds of fake demo activity is preloaded: switching to a tab with a fake invoice PDF, clicking around, opening Google Sheets, dragging rows.)

**Voiceover:**

> *"Click record. Do the work — once. Echo captures every frame, every click, every page transition in your browser."*

---

## Scene 2 — Reconstruction (0:45 – 1:30)

**Visuals:** Cut to the Skill Library page. The `PDF → Sheets` skill card animates in with a glowing pulse. Click into the skill. Show the reconstructed 5-step plan with timestamps (00:00 detect, 00:14 extract, 00:32 map, 00:48 append, 01:02 notify).

**Voiceover:**

> *"Forty-five seconds later, Gemini Vision has turned those 24 frames into a structured skill — 5 steps, the right triggers, the integrations it touches. This isn't a macro. It's a worker."*

---

## Scene 3 — Compose (1:30 – 2:30)

**Visuals:** Cut to `/agents/compose` (the headline feature). Type in the goal box: *"Every time a new invoice lands in Drive, extract the line items, append to our Master Sheet, and ping #finance on Slack."* Click *Compose*. The plan cascades in step-by-step with a satisfying stagger animation. Show: 3 sub-tasks, 2 marked parallel, matched to existing skills (HubSpot Fetcher, Inbox Triage, Slack Notifier). Total est time: 4 minutes. Est cost: $0.18.

**Voiceover:**

> *"Now you give Echo a goal in plain English. It breaks the goal into sub-tasks, matches each against your library, and proposes a parallel execution plan. One skill you don't have yet? It tells you — you record it, and the library grows."*

---

## Scene 4 — Run (2:30 – 3:30)

**Visuals:** Cut to `/agents/run`. Paste a list of 50 fake invoice IDs into the input box. Click *Run on 50 inputs*. The progress bar fans out — 50 dots arranged in a grid, each one pulsing green as its sub-agent completes. Live log: "Worker 12/50 completed in 6.2s... Worker 23/50 completed in 4.8s..." Run status goes from *queued* to *running* to *completed* in ~45 seconds. The dashboard updates in real time.

**Voiceover:**

> *"Drop a hundred inputs. Echo fans them out — a sub-agent per input, running in parallel on Cloud Run. The Taskmaster doesn't bottleneck. Each worker invokes the ADK agent, gets its skill, executes the steps, streams progress back through Pub/Sub. Forty-five seconds, fifty invoices processed, zero clicks from you."*

---

## Scene 5 — The architecture (3:30 – 3:50)

**Visuals:** Cut to the architecture diagram (the Mermaid in `docs/architecture.md`, rendered as a clean Figma-style flow). Briefly highlight: getDisplayMedia → Next.js → Gemini Vision → Firestore → Pub/Sub → Cloud Run worker → ADK agent → back to the dashboard.

**Voiceover:**

> *"All on Google Cloud. Firestore for the skill library and run history. Pub/Sub to fan out jobs. Vertex AI's Gemini 3.5 Flash for both the vision and the agent loop. Cloud Run to scale the workers. One click to record, one click to run, infinite scale to execute."*

---

## Close (3:50 – 4:00)

**Visuals:** Back to landing. The All Things Agentic hackathon badge. The `Echo*` word reveal plays one more time. URL.

**Voiceover:**

> *"Echo. The Taskmaster agent. Built for the All Things Agentic Hackathon."*

---

## Production notes

- **All data is pre-recorded** — the demo doesn't actually call Gemini or GCP. The `source: "mock"` flag in the API responses is what the demo runs on. The Gemini + Firestore + Pub/Sub + ADK paths are wired and tested, but for the video, deterministic mocks give a more polished recording.
- **Browser**: Chrome (better `getDisplayMedia` support, especially `preferCurrentTab`).
- **Resolution**: 1920x1080 minimum, 2x scale for the hero so the editorial typography reads.
- **Audio**: use a quiet lo-fi track under the voiceover for the silent cuts (capture, run progress).
- **Where to render the architecture diagram**: Figma export at 1920x1080, or paste the Mermaid source into [mermaid.live](https://mermaid.live) and screenshot.
