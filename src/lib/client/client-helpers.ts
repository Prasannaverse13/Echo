"use client";

/**
 * Tiny Web Audio helper for the demo. We synthesize the "real
 * browser captured" cue on the fly — no asset to ship, no
 * autoplay-policy drama (the AudioContext is lazily created on the
 * first user click, after which the browser allows playback).
 *
 * Two cues are exposed:
 *  - playCaptureChime()  — a soft "click" played when a real
 *                            headless screenshot arrives. Maps to
 *                            the green "real browser" badge in
 *                            the BROWSER CONSOLE.
 *  - playErrorChirp()    — a short low tone played when a
 *                            browser call fails (auth wall,
 *                            navigation timeout, etc.).
 *
 * If the browser blocks audio (autoplay policy, no user gesture
 * yet), the helper silently no-ops.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/** A short two-note ascending ping — "captured a screenshot". */
export function playCaptureChime() {
  const c = getCtx();
  if (!c) return;
  // resume() in case the context was created in a suspended state
  // (some browsers do that until a user gesture).
  c.resume?.().catch(() => undefined);
  const now = c.currentTime;
  beep(c, now, 880, 0.08, 0.08);
  beep(c, now + 0.09, 1320, 0.10, 0.10);
}

/** A single low tone — "browser call failed". */
export function playErrorChirp() {
  const c = getCtx();
  if (!c) return;
  c.resume?.().catch(() => undefined);
  beep(c, c.currentTime, 220, 0.18, 0.14);
}

function beep(
  c: AudioContext,
  at: number,
  freq: number,
  duration: number,
  gain: number
) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // Attack-decay envelope so the tone doesn't click.
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.005);
  g.gain.linearRampToValueAtTime(0, at + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** Detect the user's platform so shortcut hints show the right
 *  modifier key. */
export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Pretty modifier label for shortcut hints. */
export const MOD = IS_MAC ? "⌘" : "Ctrl";
