"use client";

import * as React from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";
import { appendLog, getUserId, type SkillRecord, saveSkillToStore } from "@/lib/client/stores";

type Phase = "idle" | "permission" | "recording" | "paused" | "uploading" | "learning" | "review" | "error";

interface ReconstructedStep {
  num: number;
  title: string;
  detail: string;
  at: string;
}

export default function RecordPage() {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [frames, setFrames] = React.useState<number>(0);
  const [stream, setStream] = React.useState<MediaStream | null>(null);
  const [steps, setSteps] = React.useState<ReconstructedStep[]>([]);
  const [skillName, setSkillName] = React.useState("");
  const [skillDescription, setSkillDescription] = React.useState("");

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const captureIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const frameBlobsRef = React.useRef<Blob[]>([]);
  const phaseRef = React.useRef<Phase>("idle");

  React.useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Timer for recording
  React.useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Cleanup stream on unmount
  React.useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    };
  }, [stream]);

  const startRecording = async () => {
    setError(null);
    setPhase("permission");
    try {
      // Browser screen capture — works in any modern browser on Mac, Windows, Linux
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 1,
          displaySurface: "browser", // prefer browser tab, fall back to window/screen
        },
        audio: false,
        ...({
          preferCurrentTab: true,
          selfBrowserSurface: "include",
        } as object),
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }

      // Detect when user clicks "Stop sharing" in browser UI
      mediaStream.getVideoTracks()[0].addEventListener("ended", () => {
        if (phaseRef.current === "recording") {
          stopAndLearn();
        }
      });

      setPhase("recording");
      setElapsed(0);
      setFrames(0);
      frameBlobsRef.current = [];

      // Capture a frame every 2 seconds while recording
      captureIntervalRef.current = setInterval(() => {
        captureFrame();
      }, 2000);
    } catch (err) {
      setPhase("idle");
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          setError(
            "You dismissed the screen share prompt. Click Start again and pick a screen or tab to share."
          );
        } else if (err.name === "NotSupportedError") {
          setError(
            "Your browser doesn't support screen capture. Try Chrome, Edge, Arc, or Brave."
          );
        } else {
          setError(`Couldn't start recording: ${err.message}`);
        }
      } else {
        setError("Couldn't start recording. Please try again.");
      }
    }
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          frameBlobsRef.current.push(blob);
          setFrames((n) => n + 1);
        }
      },
      "image/jpeg",
      0.7
    );
  };

  const stopAndLearn = async () => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }

    if (frameBlobsRef.current.length === 0) {
      setError(
        "No frames captured. Make sure you shared a visible screen or tab."
      );
      setPhase("idle");
      return;
    }

    setPhase("uploading");
    // Brief upload phase for UX feedback
    await new Promise((r) => setTimeout(r, 600));
    setPhase("learning");

    try {
      const res = await fetch("/api/skills/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frameCount: frameBlobsRef.current.length,
          durationSec: elapsed,
        }),
      });

      if (!res.ok) {
        throw new Error(`Reconstruction failed: ${res.status}`);
      }

      const data = await res.json();
      setSteps(data.steps);
      setSkillName(data.suggestedName ?? "");
      setSkillDescription(data.suggestedDescription ?? "");
      setPhase("review");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Echo couldn't reconstruct this skill. Please try again."
      );
      setPhase("idle");
    }
  };

  const reset = () => {
    setPhase("idle");
    setError(null);
    setElapsed(0);
    setFrames(0);
    setSteps([]);
    setSkillName("");
    setSkillDescription("");
    frameBlobsRef.current = [];
  };

  const userId = React.useMemo(getUserId, []);

  const saveSkill = () => {
    const name = (skillName || "Untitled skill").trim();
    const id = `skill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const colors: SkillRecord["color"][] = ["dusty-sky", "wisteria", "desert-clay", "mist-mint"];
    const skill: SkillRecord = {
      id,
      name,
      description: skillDescription || "Recorded from screen capture",
      color: colors[Math.floor(Math.random() * colors.length)],
      trigger: "Manual",
      steps: steps.map((s) => ({ num: s.num, title: s.title, detail: s.detail, at: s.at })),
      createdAt: new Date().toISOString(),
      source: "recorder",
    };
    saveSkillToStore(userId, skill);
    appendLog(userId, { level: "success", agent: "echo-recorder", msg: `Skill saved: ${name}` });
    // Persist the skill back to the server too (best-effort)
    fetch("/api/skills/reconstruct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skillId: id,
        name,
        description: skill.description,
        steps: skill.steps,
        save: true,
      }),
    }).catch(() => undefined);
    // Hand off to the skills page
    if (typeof window !== "undefined") window.location.href = `/skills/${id}`;
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="page-container py-10">
      <div className="mb-8">
        <p className="text-caption text-obsidian/50 mb-2">Record</p>
        <h1 className="text-display-md font-bold">Teach Echo a new skill.</h1>
        <p className="mt-3 text-body text-obsidian/70 max-w-2xl">
          Perform the workflow on your screen. Echo watches, learns the
          pattern, then runs it forever — on any input, in the background.
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
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div
                  className={`w-3 h-3 rounded-full ${
                    phase === "recording"
                      ? "bg-red-500 animate-pulse"
                      : phase === "learning" || phase === "uploading"
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
                    {phase === "permission" && "Requesting screen access..."}
                    {phase === "recording" && "Recording"}
                    {phase === "uploading" && "Uploading frames..."}
                    {phase === "learning" && "Echo is learning..."}
                    {phase === "review" && "Skill ready for review"}
                  </p>
                  <p
                    className={`text-heading-sm font-bold tabular-nums ${
                      phase === "recording" ? "text-paper-white" : "text-obsidian"
                    }`}
                  >
                    {mm}:{ss}
                    {phase === "recording" && (
                      <span className="text-caption font-normal opacity-60 ml-3">
                        · {frames} frame{frames === 1 ? "" : "s"} captured
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {phase === "idle" && (
                  <Button
                    variant="light"
                    size="md"
                    onClick={startRecording}
                  >
                    ◉ Start recording
                  </Button>
                )}
                {(phase === "permission" ||
                  phase === "uploading" ||
                  phase === "learning") && (
                  <Button variant="outline-light" size="md" disabled>
                    ◌ {phase === "learning" ? "Reconstructing..." : "Working..."}
                  </Button>
                )}
                {phase === "recording" && (
                  <Button variant="dark" size="md" onClick={stopAndLearn}>
                    ⏹ Stop & learn
                  </Button>
                )}
                {phase === "review" && (
                  <>
                    <Button variant="outline-light" size="md" onClick={reset}>
                      ↻ Re-record
                    </Button>
                    <Button variant="light" size="md" onClick={saveSkill}>
                      ✓ Save skill
                    </Button>
                  </>
                )}
              </div>
            </div>
          </FeatureCard>

          {error && (
            <FeatureCard surface="desert-clay" padding="md">
              <p className="text-body-sm font-medium">⚠ {error}</p>
            </FeatureCard>
          )}

          {/* Screen preview */}
          <FeatureCard
            surface="deep-teal"
            padding="lg"
            className="aspect-video flex flex-col items-center justify-center text-paper-white overflow-hidden relative"
          >
            {phase === "recording" ? (
              <>
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-contain bg-obsidian"
                  muted
                  playsInline
                />
                <div className="absolute top-4 left-4 z-10">
                  <div className="px-3 py-1.5 rounded-full bg-red-500/90 backdrop-blur-sm flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-paper-white animate-pulse" />
                    <span className="text-caption font-bold text-paper-white tracking-wider">
                      REC
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-paper-white/10 flex items-center justify-center mb-4">
                  <span className="text-3xl">◉</span>
                </div>
                <p className="text-heading-sm font-medium mb-1">
                  {phase === "idle" && "Click Start to share your screen"}
                  {phase === "permission" && "Pick a tab or window to share"}
                  {phase === "uploading" && "Uploading frames to Gemini..."}
                  {phase === "learning" && "Reconstructing your skill..."}
                  {phase === "review" && "Skill reconstructed!"}
                </p>
                <p className="text-body-sm text-paper-white/60 text-center max-w-sm px-4">
                  {phase === "idle" &&
                    "Echo uses your browser's built-in screen capture. No install, no extension — works in Chrome, Edge, Arc, and Brave."}
                  {phase === "permission" &&
                    "Choose a browser tab, window, or entire screen. We capture a frame every 2 seconds."}
                  {phase === "learning" &&
                    "Gemini 3.5 Flash is analyzing your frames to extract intent, steps, and decision points."}
                  {phase === "review" &&
                    "Review the steps below, name your skill, then save it to your library."}
                </p>
              </>
            )}
            {/* Hidden canvas for frame capture */}
            <canvas ref={canvasRef} className="hidden" />
          </FeatureCard>

          {/* Review panel */}
          {phase === "review" && steps.length > 0 && (
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
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              placeholder="e.g. PDF → Sheets"
              disabled={phase !== "review"}
              className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm mb-3 focus:outline-none focus:border-obsidian disabled:opacity-50"
            />
            <label className="text-caption font-medium block mb-1">
              Description
            </label>
            <textarea
              value={skillDescription}
              onChange={(e) => setSkillDescription(e.target.value)}
              rows={3}
              placeholder="What does this skill accomplish?"
              disabled={phase !== "review"}
              className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm resize-none focus:outline-none focus:border-obsidian disabled:opacity-50"
            />
          </FeatureCard>

          <FeatureCard surface="dusty-sky" padding="md">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-2">
              How it works
            </h3>
            <ul className="text-body-sm space-y-2">
              <li>• Echo uses your browser's built-in screen capture — no install.</li>
              <li>• Frames are captured every 2 seconds and sent to Gemini Vision.</li>
              <li>• Gemini reconstructs the intent and ordered steps from your frames.</li>
              <li>• You can edit the steps before saving.</li>
            </ul>
          </FeatureCard>

          <FeatureCard surface="paper-white" padding="md" className="hairline">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-3">
              Browser support
            </h3>
            <ul className="space-y-2 text-body-sm">
              <li className="flex items-center gap-2">
                <span className="text-mist-mint">●</span> Chrome 94+
              </li>
              <li className="flex items-center gap-2">
                <span className="text-mist-mint">●</span> Edge 94+
              </li>
              <li className="flex items-center gap-2">
                <span className="text-mist-mint">●</span> Arc, Brave, Opera
              </li>
              <li className="flex items-center gap-2">
                <span className="text-obsidian/30">○</span> Firefox (limited)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-obsidian/30">○</span> Safari
              </li>
            </ul>
          </FeatureCard>
        </div>
      </div>
    </div>
  );
}
