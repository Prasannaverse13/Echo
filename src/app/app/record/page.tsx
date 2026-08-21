"use client";

import * as React from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";

type Phase = "idle" | "recording" | "paused" | "learning" | "review";

export default function RecordPage() {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [elapsed, setElapsed] = React.useState(0);
  const [steps, setSteps] = React.useState<
    { num: number; title: string; detail: string; at: string }[]
  >([]);

  React.useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const startRecording = () => {
    setPhase("recording");
    setElapsed(0);
    setSteps([]);
  };

  const stopAndLearn = () => {
    setPhase("learning");
    setTimeout(() => {
      setPhase("review");
      setSteps([
        {
          num: 1,
          title: "Detect new file in Drive/Invoices",
          detail: "Echo watches the folder for new PDFs.",
          at: "00:00",
        },
        {
          num: 2,
          title: "Extract tabular data",
          detail: "Reads line items, totals, vendor info from the PDF.",
          at: "00:14",
        },
        {
          num: 3,
          title: "Append to Google Sheet",
          detail: "Maps fields to columns and appends a new row.",
          at: "00:32",
        },
        {
          num: 4,
          title: "Send Slack notification",
          detail: "Posts to #finance with the total and a Drive link.",
          at: "00:51",
        },
      ]);
    }, 2200);
  };

  return (
    <div className="page-container py-10">
      <div className="mb-8">
        <p className="text-caption text-obsidian/50 mb-2">Record</p>
        <h1 className="text-display-md font-bold">Teach Echo a new skill.</h1>
        <p className="mt-3 text-body text-obsidian/70 max-w-2xl">
          Perform the workflow on your screen. Echo will watch, then
          reconstruct it as a reusable skill you can run forever.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main canvas */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status bar */}
          <FeatureCard
            surface={phase === "recording" ? "obsidian" : "paper-white"}
            padding="md"
            className={phase !== "recording" ? "hairline" : ""}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={`w-3 h-3 rounded-full ${
                    phase === "recording"
                      ? "bg-red-500 animate-pulse"
                      : phase === "learning"
                        ? "bg-slate-teal animate-pulse"
                        : "bg-obsidian/20"
                  }`}
                />
                <div>
                  <p
                    className={`text-caption font-medium uppercase tracking-wider ${
                      phase === "recording" ? "text-paper-white/60" : "text-obsidian/60"
                    }`}
                  >
                    {phase === "idle" && "Ready"}
                    {phase === "recording" && "Recording"}
                    {phase === "paused" && "Paused"}
                    {phase === "learning" && "Echo is learning..."}
                    {phase === "review" && "Skill ready for review"}
                  </p>
                  <p
                    className={`text-heading-sm font-bold tabular-nums ${
                      phase === "recording" ? "text-paper-white" : "text-obsidian"
                    }`}
                  >
                    {mm}:{ss}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {phase === "idle" && (
                  <Button variant="light" size="md" onClick={startRecording}>
                    ◉ Start recording
                  </Button>
                )}
                {phase === "recording" && (
                  <>
                    <Button variant="outline-dark" size="md">
                      ⏸ Pause
                    </Button>
                    <Button variant="dark" size="md" onClick={stopAndLearn}>
                      ⏹ Stop & learn
                    </Button>
                  </>
                )}
                {phase === "learning" && (
                  <Button variant="outline-light" size="md" disabled>
                    ◌ Processing...
                  </Button>
                )}
                {phase === "review" && (
                  <Button variant="light" size="md">
                    ✓ Save skill
                  </Button>
                )}
              </div>
            </div>
          </FeatureCard>

          {/* Screen preview */}
          <FeatureCard surface="deep-teal" padding="lg" className="aspect-video flex flex-col items-center justify-center text-paper-white">
            <div className="w-16 h-16 rounded-full bg-paper-white/10 flex items-center justify-center mb-4">
              <span className="text-3xl">◉</span>
            </div>
            <p className="text-heading-sm font-medium mb-1">
              {phase === "idle" && "Your screen will appear here"}
              {phase === "recording" && "Capturing your screen..."}
              {phase === "learning" && "Reconstructing with Gemini..."}
              {phase === "review" && "Skill reconstructed"}
            </p>
            <p className="text-body-sm text-paper-white/60 text-center max-w-sm">
              {phase === "idle" && "Click start, then perform your workflow anywhere on your screen."}
              {phase === "recording" && "Do the workflow naturally. Echo is watching."}
              {phase === "learning" && "Extracting intent, steps, and decision points."}
              {phase === "review" && "Review the reconstructed skill below, then save."}
            </p>
            {phase === "recording" && (
              <div className="mt-6 px-4 py-2 rounded-full bg-red-500/20 border border-red-500/40">
                <span className="text-caption font-medium text-red-200">● REC</span>
              </div>
            )}
          </FeatureCard>

          {/* Review panel */}
          {phase === "review" && (
            <div>
              <h2 className="text-heading-sm font-bold mb-3">
                Echo reconstructed these steps
              </h2>
              <div className="space-y-2">
                {steps.map((s) => (
                  <FeatureCard
                    key={s.num}
                    surface="paper-white"
                    padding="md"
                    className="hairline"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-obsidian text-paper-white flex items-center justify-center font-bold text-caption">
                        {s.num}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-body font-bold">{s.title}</h3>
                          <span className="text-caption text-obsidian/50 tabular-nums">
                            {s.at}
                          </span>
                        </div>
                        <p className="text-body-sm text-obsidian/70 mt-1">
                          {s.detail}
                        </p>
                      </div>
                    </div>
                  </FeatureCard>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <FeatureCard surface="paper-white" padding="md" className="hairline">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-3">
              Skill details
            </h3>
            <label className="text-caption font-medium block mb-1">
              Skill name
            </label>
            <input
              type="text"
              placeholder="e.g. PDF → Sheets"
              className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm mb-3 focus:outline-none focus:border-obsidian"
            />
            <label className="text-caption font-medium block mb-1">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="What does this skill accomplish?"
              className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm resize-none focus:outline-none focus:border-obsidian"
            />
          </FeatureCard>

          <FeatureCard surface="dusty-sky" padding="md">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-2">
              Tips
            </h3>
            <ul className="text-body-sm space-y-2">
              <li>• Speak out loud what you're doing — Echo transcribes audio for intent.</li>
              <li>• Do the workflow at your normal pace. No need to slow down.</li>
              <li>• Make sure to show the trigger (e.g. the file arriving, the email opening).</li>
              <li>• End at the success state so Echo learns the completion criteria.</li>
            </ul>
          </FeatureCard>

          <FeatureCard surface="paper-white" padding="md" className="hairline">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-3">
              Permissions
            </h3>
            <ul className="space-y-2 text-body-sm">
              <li className="flex items-center gap-2">
                <span className="text-slate-teal">●</span> Screen capture
              </li>
              <li className="flex items-center gap-2">
                <span className="text-slate-teal">●</span> Microphone (optional)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-obsidian/30">○</span> Webcam
              </li>
            </ul>
          </FeatureCard>
        </div>
      </div>
    </div>
  );
}
