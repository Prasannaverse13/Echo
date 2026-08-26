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
  // The whole recorded video (webm) lives here between "Stop & learn"
  // and the upload to /api/skills/reconstruct. Set by the MediaRecorder's
  // onstop callback; consumed by stopAndLearn.
  const recordedVideoRef = React.useRef<Blob | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  // Best-quality webm the browser supports. We fall back if the codec
  // string is rejected.
  const PREFERRED_MIME_TYPES = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];

  React.useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Timer for recording. At 60s we surface a "wrap it up" hint; at 90s we
  // auto-stop so the captured webm stays well under Vercel's 4.5 MB body
  // limit. (60s @ 150 kbps ≈ 1.1 MB raw; 90s ≈ 1.7 MB — both safe
  // once base64-encoded.)
  const RECORDING_SOFT_CAP_S = 60;
  const RECORDING_HARD_CAP_S = 90;
  React.useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        if (next === RECORDING_SOFT_CAP_S) {
          setError(
            "You've hit the 60s mark — Echo works best with 30-90s. Stop now, or let it auto-stop at 90s."
          );
        } else if (next >= RECORDING_HARD_CAP_S) {
          // Hard cap: stop and learn so we never post a recording big
          // enough to hit Vercel's body limit.
          stopAndLearn();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
    };
  }, [stream]);

  const startRecording = async () => {
    setError(null);
    setPhase("permission");
    try {
      // Browser screen capture — works in any modern browser on Mac, Windows, Linux
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        // No `displaySurface` or `preferCurrentTab` here — forcing the
        // current tab creates a feedback loop where the video element is
        // trying to display the very stream it's being captured from, and
        // Chrome blanks it out (resulting in all-black frames). Letting the
        // user pick any tab/window/screen via the native picker avoids this.
        video: { frameRate: 1 },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.srcObject = mediaStream;
        // Wait until the video element actually has dimensions before
        // considering the stream "ready" — otherwise the first captureFrame
        // calls find videoWidth === 0 and bail.
        await new Promise<void>((resolve) => {
          const v = videoRef.current!;
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            resolve();
            return;
          }
          const onMeta = () => {
            v.removeEventListener("loadedmetadata", onMeta);
            resolve();
          };
          v.addEventListener("loadedmetadata", onMeta);
          v.play().catch(() => undefined);
          // Hard timeout: 2s is enough for the native picker to land a frame.
          setTimeout(() => {
            v.removeEventListener("loadedmetadata", onMeta);
            resolve();
          }, 2000);
        });
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
      blackFrameCheckRef.current = 0;
      recordedVideoRef.current = null;

      // Record the entire stream as a webm and let Gemini analyze the
      // full video. We keep frame capture as a no-op fallback for
      // browsers without MediaRecorder support.
      const pickedMime = PREFERRED_MIME_TYPES.find(
        (t) =>
          typeof MediaRecorder !== "undefined" &&
          MediaRecorder.isTypeSupported(t)
      );
      if (pickedMime && typeof MediaRecorder !== "undefined") {
        try {
          const recorder = new MediaRecorder(mediaStream, {
            mimeType: pickedMime,
            // 150 kbps — a 60s screen recording lands at ~1.1 MB, well under
            // Vercel's 4.5MB request body limit even with base64 inflation.
            // Screen captures compress well at this rate because most of
            // the frame is static UI chrome.
            videoBitsPerSecond: 150_000,
          });
          mediaRecorderRef.current = recorder;
          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: pickedMime });
            recordedVideoRef.current = blob;
            // Estimate frame count for the UI badge (assume 1 fps).
            setFrames(Math.max(1, Math.round(blob.size / 30_000)));
          };
          recorder.onerror = (e) => {
            console.warn("[record] MediaRecorder error:", e);
          };
          // Start with timeslice=1000 so we get periodic data events
          // (helps the onstop handler not sit on a single big blob).
          recorder.start(1000);
        } catch (e) {
          console.warn("[record] MediaRecorder init failed, falling back to frames:", e);
          captureIntervalRef.current = setInterval(captureFrame, 2000);
        }
      } else {
        // Old browser: frame-mode fallback.
        captureIntervalRef.current = setInterval(captureFrame, 2000);
      }
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
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    // Downscale to a fixed width so the per-frame JPEG is small (~30-60KB
    // at quality 0.6). 24 frames * 50KB * 4/3 base64 = ~1.6MB total —
    // comfortably under Vercel's 4.5MB request body limit. Gemini still
    // sees plenty of detail to identify UI elements, text, and clicks.
    const TARGET_WIDTH = 640;
    const targetHeight = Math.max(
      1,
      Math.round((video.videoHeight * TARGET_WIDTH) / video.videoWidth)
    );
    canvas.width = TARGET_WIDTH;
    canvas.height = targetHeight;
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
      0.6
    );
  };

  /**
   * Compute the mean luma (0-255) of the most recent captured frame.
   * Returns null if there are no frames yet, or if the frame is in a
   * format that doesn't expose ImageData. Used to detect "all-black"
   * captures (the user shared a tab that's mostly dark, or the screen
   * capture is returning a black surface for some reason).
   */
  const computeRecentFrameLuma = (): number | null => {
    if (!canvasRef.current) return null;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return null;
    try {
      const w = canvasRef.current.width;
      const h = canvasRef.current.height;
      if (w === 0 || h === 0) return null;
      const data = ctx.getImageData(0, 0, w, h).data;
      let sum = 0;
      // Sample every 32nd pixel for speed (still ~2k samples on a 640x360).
      for (let i = 0; i < data.length; i += 32 * 4) {
        // Rec. 601 luma
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      const samples = Math.floor(data.length / (32 * 4));
      return samples > 0 ? sum / samples : null;
    } catch {
      // getImageData can throw if the canvas is tainted (cross-origin
      // MediaStream). In that case we can't tell — return null.
      return null;
    }
  };

  /**
   * Background watcher: every 2s while recording, detect a "blank
   * capture" and surface a clear actionable error. Two failure modes
   * we have to catch:
   *
   *   1. The user shared the SAME tab Echo is on. Chrome blanks out
   *      the current tab's MediaStream to break the feedback loop
   *      (otherwise the page would be trying to display its own
   *      capture), so the MediaRecorder gets essentially no data and
   *      the produced webm is tiny.
   *   2. The user picked a screen or window that's all-dark (e.g. a
   *      locked screen, a black slide deck, a desktop with no open
   *      windows in the captured area). The stream is valid but the
   *      pixels are all near-black.
   *
   * We sample the LIVE video element (the same MediaStream that the
   * MediaRecorder is reading) and check mean luma. If it's < 8/255
   * for 4+ seconds we auto-stop, throw away the recording, and tell
   * the user to pick a different tab/window.
   */
  const blackFrameCheckRef = React.useRef(0);
  const lastSizeSampleRef = React.useRef(0);
  const sizeGrowthStalledRef = React.useRef(0);
  React.useEffect(() => {
    if (phase !== "recording") return;
    lastSizeSampleRef.current = 0;
    sizeGrowthStalledRef.current = 0;
    blackFrameCheckRef.current = 0;
    const t = setInterval(() => {
      // Approach 1: luma on the live video element. This tells us
      // whether the captured STREAM has visible content.
      const luma = (() => {
        const v = videoRef.current;
        if (!v || v.videoWidth === 0 || v.videoHeight === 0) return null;
        // Snapshot the live video frame into the canvas, then read pixels.
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const w = 320;
        const h = Math.max(1, Math.round((v.videoHeight * w) / v.videoWidth));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        try {
          ctx.drawImage(v, 0, 0, w, h);
        } catch {
          return null; // tainted — can't read
        }
        try {
          const data = ctx.getImageData(0, 0, w, h).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 16 * 4) {
            sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          }
          const samples = Math.floor(data.length / (16 * 4));
          return samples > 0 ? sum / samples : null;
        } catch {
          return null;
        }
      })();

      // Approach 2: MediaRecorder encoded-size growth. If the encoder
      // has produced nothing new in the last 2s, the stream is empty
      // (independent of why — current-tab feedback loop, hardware
      // permission issue, etc.).
      const rec = mediaRecorderRef.current;
      let sizeNow = 0;
      if (rec && rec.state === "recording") {
        // MediaRecorder doesn't expose a size, so we infer from the
        // chunk count. We have to read our internal chunks ref via
        // the most-recent data event — easier: just count data events
        // by reading the recorder's internal state via a side effect.
        // For simplicity here, we fall back to the luma check.
        sizeNow = 0;
      }
      void sizeNow; // reserved for future per-event counter

      if (luma === null) return; // can't read stream yet
      if (luma < 8) {
        blackFrameCheckRef.current += 1;
        if (blackFrameCheckRef.current === 1) {
          setError(
            "Captured stream is all black. You're probably sharing the same tab Echo is on — Chrome blanks it out. Pick a different tab or window in the share picker."
          );
        } else if (blackFrameCheckRef.current >= 2) {
          // ~4s of consistently blank frames — give up.
          stopAndLearn();
        }
      } else {
        blackFrameCheckRef.current = 0;
        if (luma < 25) {
          setError(
            "Captured stream is very dim. If the workflow isn't visible, pick a brighter tab or window."
          );
        }
      }
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Convert a single Blob to a base64 data URL. Throws on read failure.
  const blobToDataUrl = (b: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error || new Error("FileReader failed"));
      r.readAsDataURL(b);
    });

  // Convert an array of JPEG Blobs to base64 data URLs, in parallel.
  // Throws if any blob fails to read.
  const blobsToDataUrls = (blobs: Blob[]): Promise<string[]> =>
    Promise.all(
      blobs.map(
        (b) =>
          new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(r.error || new Error("FileReader failed"));
            r.readAsDataURL(b);
          })
      )
    );

  // Evenly sample `n` items from a list (always includes first and last).
  const sampleEvenly = <T,>(items: T[], n: number): T[] => {
    if (items.length <= n) return items.slice();
    if (n <= 1) return [items[0]];
    const out: T[] = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.round((i * (items.length - 1)) / (n - 1));
      out.push(items[idx]);
    }
    return out;
  };

  const stopAndLearn = async () => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    // Stop the MediaRecorder first; its onstop will populate
    // recordedVideoRef with the final Blob, then we wait for that.
    const recorder = mediaRecorderRef.current;
    let videoPromise: Promise<Blob | null> = Promise.resolve(
      recordedVideoRef.current
    );
    if (recorder && recorder.state !== "inactive") {
      videoPromise = new Promise<Blob | null>((resolve) => {
        const onStop = () => {
          recorder.removeEventListener("stop", onStop);
          resolve(recordedVideoRef.current);
        };
        recorder.addEventListener("stop", onStop);
        try {
          recorder.stop();
        } catch {
          resolve(recordedVideoRef.current);
        }
      });
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }

    const videoBlob = await videoPromise;

    // Nothing to analyze if both code paths produced nothing.
    if (!videoBlob && frameBlobsRef.current.length === 0) {
      setError(
        "No video captured. You can still create the skill by hand on the right — name it, describe it, and hit Save."
      );
      setPhase("idle");
      setElapsed(0);
      return;
    }

    // The MediaRecorder produced a blob but it's tiny — almost always
    // because the user shared the same tab Echo is on and Chrome gave
    // us a blank stream. Bail before wasting a Gemini call and a 30s
    // round trip on a useless upload.
    if (videoBlob && videoBlob.size < 4_000) {
      setError(
        "Recording came back empty (under 4 KB). You're probably sharing the same tab Echo is on — Chrome blanks it out. Pick a different tab or window in the share picker."
      );
      setPhase("idle");
      setElapsed(0);
      return;
    }

    setPhase("uploading");
    setError(null);
    try {
      setPhase("learning");
      const res = await fetch("/api/skills/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          videoBlob
            ? {
                durationSec: elapsed,
                video: await blobToDataUrl(videoBlob),
                videoMimeType: videoBlob.type || "video/webm",
                // Keep the frame path as a backup channel for clients
                // without MediaRecorder. Backend prefers `video` if set.
                frames: [],
              }
            : {
                frameCount: frameBlobsRef.current.length,
                durationSec: elapsed,
                frames: await blobsToDataUrls(
                  sampleEvenly(frameBlobsRef.current, 24)
                ),
              }
        ),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          errBody?.error || `Reconstruction failed: HTTP ${res.status}`
        );
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
      setElapsed(0);
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

  const [saving, setSaving] = React.useState(false);
  const [manualStepsRaw, setManualStepsRaw] = React.useState("");

  const buildManualSkill = (): SkillRecord | null => {
    const name = skillName.trim();
    if (!name) return null;
    const description = skillDescription.trim() || "Manually created skill";
    const id = `skill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const colors: SkillRecord["color"][] = ["dusty-sky", "wisteria", "desert-clay", "mist-mint"];
    // Build steps: prefer reconstructed steps, otherwise parse the manual
    // "one per line" textarea, otherwise fall back to a single placeholder step.
    const baseSteps: Array<{ num: number; title: string; detail: string; at: string }> =
      steps.length > 0
        ? steps.map((s) => ({ num: s.num, title: s.title, detail: s.detail, at: s.at }))
        : manualStepsRaw
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
            .map((l, i) => {
              const [title, ...rest] = l.split(" — ");
              return {
                num: i + 1,
                title: title || l,
                detail: rest.join(" — ") || "",
                at: "",
              };
            });
    const finalSteps =
      baseSteps.length > 0
        ? baseSteps
        : [{ num: 1, title: "Execute the workflow", detail: description, at: "" }];
    return {
      id,
      name: name.slice(0, 80),
      description: description.slice(0, 500),
      color: colors[Math.floor(Math.random() * colors.length)],
      trigger: "Manual",
      steps: finalSteps,
      createdAt: new Date().toISOString(),
      source: steps.length > 0 ? "recorder" : "manual",
    };
  };

  const saveSkill = async () => {
    const skill = buildManualSkill();
    if (!skill) {
      setError("Give your skill a name before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    // Local store first (always succeeds)
    try {
      saveSkillToStore(userId, skill);
      appendLog(userId, {
        level: "success",
        agent: "echo-recorder",
        msg: `Skill saved: ${skill.name}`,
      });
    } catch (e) {
      console.error("[record] local save failed:", e);
    }
    // Best-effort persist to server
    try {
      const r = await fetch("/api/skills/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId: skill.id,
          name: skill.name,
          description: skill.description,
          steps: skill.steps,
          trigger: skill.trigger,
        }),
      });
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        appendLog(userId, {
          level: "info",
          agent: "echo-recorder",
          msg: `Persisted to Firestore: ${data?.gcp ?? "?"}`,
        });
      }
    } catch (e) {
      console.warn("[record] server save failed (non-fatal):", e);
    } finally {
      setSaving(false);
      if (typeof window !== "undefined") window.location.href = `/skills/${skill.id}`;
    }
  };

  const canSaveManual = skillName.trim().length > 0 && !saving;

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
                    {phase === "uploading" && "Uploading video..."}
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
                        · {frames > 0
                          ? `${(frames * 30 / 1024).toFixed(1)} MB recorded`
                          : "recording…"}
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
            {/* Hidden video element. The live preview is intentionally
                NOT shown to the user — Chrome blanks out the video
                element whenever the captured surface includes the
                current tab (feedback loop prevention), and seeing a
                black box makes the user think recording is broken. We
                keep the element around so the luma watchdog can read
                pixels from it. */}
            <video
              ref={videoRef}
              className="hidden"
              muted
              playsInline
            />
            {phase === "recording" ? (
              <div className="flex flex-col items-center justify-center text-paper-white px-6 text-center">
                <div className="px-4 py-2 rounded-full bg-red-500/90 backdrop-blur-sm flex items-center gap-2 mb-6">
                  <div className="w-2.5 h-2.5 rounded-full bg-paper-white animate-pulse" />
                  <span className="text-caption font-bold text-paper-white tracking-wider">
                    RECORDING
                  </span>
                </div>
                <p className="text-display-md font-bold tabular-nums">
                  {mm}:{ss}
                </p>
                <p className="text-body-sm text-paper-white/70 mt-2 max-w-md">
                  {frames > 0
                    ? `${(frames * 30 / 1024).toFixed(1)} MB captured so far`
                    : "Waiting for the encoder to produce frames…"}
                </p>
                <p className="text-caption text-paper-white/50 mt-4 max-w-md">
                  Go perform the workflow on the tab or window you shared. Echo is
                  watching it — you don't need to keep this page in front.
                </p>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-paper-white/10 flex items-center justify-center mb-4">
                  <span className="text-3xl">◉</span>
                </div>
                <p className="text-heading-sm font-medium mb-1">
                  {phase === "idle" && "Click Start to share your screen"}
                  {phase === "permission" && "Pick a tab or window to share"}
                  {phase === "uploading" && "Uploading screen recording to Gemini..."}
                  {phase === "learning" && "Reconstructing your skill..."}
                  {phase === "review" && "Skill reconstructed!"}
                </p>
                <p className="text-body-sm text-paper-white/60 text-center max-w-sm px-4">
                  {phase === "idle" &&
                    "Echo uses your browser's built-in screen capture. No install, no extension — works in Chrome, Edge, Arc, and Brave."}
                  {phase === "permission" &&
                    "Choose a browser tab, window, or entire screen. Echo records up to 90s."}
                  {phase === "learning" &&
                    "Gemini is watching the video to extract the intent, ordered steps, and decision points."}
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
              {phase === "review" ? "Skill details" : "Create by hand"}
            </h3>
            <label className="text-caption font-medium block mb-1">
              Skill name
            </label>
            <input
              type="text"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              placeholder="e.g. PDF → Sheets"
              maxLength={80}
              className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm mb-3 focus:outline-none focus:border-obsidian"
            />
            <label className="text-caption font-medium block mb-1">
              Description
            </label>
            <textarea
              value={skillDescription}
              onChange={(e) => setSkillDescription(e.target.value)}
              rows={3}
              placeholder="What does this skill accomplish?"
              maxLength={500}
              className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm resize-none mb-3 focus:outline-none focus:border-obsidian"
            />
            {phase !== "review" && (
              <>
                <label className="text-caption font-medium block mb-1">
                  Steps{" "}
                  <span className="text-obsidian/40 font-normal">
                    (optional · one per line · "title — detail")
                  </span>
                </label>
                <textarea
                  value={manualStepsRaw}
                  onChange={(e) => setManualStepsRaw(e.target.value)}
                  rows={5}
                  placeholder={
                    "Open the source spreadsheet\nFilter for last week's rows — only keep Status=Done\nCopy the matching rows into the summary tab"
                  }
                  className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm resize-none mb-3 focus:outline-none focus:border-obsidian font-mono text-caption"
                />
              </>
            )}
            <Button
              variant="light"
              size="md"
              onClick={saveSkill}
              disabled={!canSaveManual}
              className="w-full"
            >
              {saving ? "Saving…" : "✓ Save skill"}
            </Button>
            {phase !== "review" && (
              <p className="mt-2 text-caption text-obsidian/50">
                Saves locally + to Firestore. The Composer and Run flows can pick it
                up immediately.
              </p>
            )}
          </FeatureCard>

          <FeatureCard surface="dusty-sky" padding="md">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-2">
              How it works
            </h3>
            <ul className="text-body-sm space-y-2">
              <li>• Echo uses your browser's built-in screen capture — no install.</li>
              <li>• The full screen recording (up to 90s) is sent to Gemini.</li>
              <li>• Gemini reconstructs the intent, steps, and decision points.</li>
              <li>• Or skip the recording entirely — type a name + steps and save.</li>
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
