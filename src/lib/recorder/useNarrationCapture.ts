"use client";

/**
 * `useNarrationCapture` — captures the user's voice narration during a
 * recording session and returns the audio blob + segments when stopped.
 *
 * Implementation:
 *   - On `start()`, requests mic access via `getUserMedia({ audio: true })`.
 *   - Records a `audio/webm;codecs=opus` blob with `MediaRecorder` (same
 *     approach as the screen recorder). Falls back to `audio/webm` then
 *     no-op if MediaRecorder is unavailable.
 *   - On `stop()`, returns the audio blob. The Recorder page POSTs it
 *     to `/api/skills/transcribe` to get back the text + segments.
 *
 * Limitations:
 *   - Browser-based mic capture is a separate `getUserMedia` call from
 *     the screen capture; the user has to grant both permissions.
 *   - On Vercel, the transcription happens server-side via OpenAI's
 *     `gpt-4o-transcribe` (set `OPENAI_API_KEY` in env).
 *   - We do not echo the user's mic back to them; no playback.
 */

import { useEffect, useRef, useState } from "react";

export interface UseNarrationCaptureOpts {
  active: boolean;
  /** Called when a new audio chunk is available (for live VU meter, etc.). */
  onChunk?: (size: number) => void;
  /** Called if mic access fails or the recorder errors. */
  onError?: (err: Error) => void;
}

export interface UseNarrationCaptureResult {
  /** True while the mic is actively recording. */
  recording: boolean;
  /** True if the user denied mic permission or the browser doesn't support it. */
  denied: boolean;
  /** The captured audio blob once `stop()` has resolved. */
  audio: Blob | null;
  /** Elapsed seconds since the mic started. */
  elapsed: number;
}

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

export function useNarrationCapture(opts: UseNarrationCaptureOpts): UseNarrationCaptureResult {
  const [recording, setRecording] = useState(false);
  const [denied, setDenied] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onChunkRef = useRef(opts.onChunk);
  const onErrorRef = useRef(opts.onError);
  onChunkRef.current = opts.onChunk;
  onErrorRef.current = opts.onError;
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!opts.active) {
      // If we were recording, stop gracefully.
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          setDenied(true);
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const pickedMime = PREFERRED_MIME_TYPES.find(
          (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)
        );
        if (typeof MediaRecorder === "undefined" || !pickedMime) {
          setDenied(true);
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          return;
        }
        const recorder = new MediaRecorder(stream, { mimeType: pickedMime });
        recorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunksRef.current.push(e.data);
            onChunkRef.current?.(e.data.size);
          }
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: pickedMime });
          setAudio(blob);
          setRecording(false);
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
        };
        recorder.onerror = (e) => {
          const err = (e as unknown as { error?: Error }).error ?? new Error("MediaRecorder error");
          onErrorRef.current?.(err);
        };
        startedAtRef.current = Date.now();
        recorder.start(1000);
        setRecording(true);
      } catch (err) {
        if (err instanceof Error && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
          setDenied(true);
        } else {
          onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.active]);

  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Expose a way to flush-stop the recorder from the parent. We tie this to
  // `active` going false (parent's stopAndLearn sets it false). The parent
  // then awaits the resulting audio via the `audio` state in a follow-up
  // effect — but for simplicity here the parent polls `audio`.
  return { recording, denied, audio, elapsed };
}
