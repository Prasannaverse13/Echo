"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, NavBar, Footer, FeatureTag } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { GoogleButton } from "@/components/auth/GoogleButton";
import {
  login,
  getSession,
  getLoginAttemptInfo,
  type LoginResult,
} from "@/lib/auth/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number>(3);
  const [busy, setBusy] = useState(false);

  // If already signed in, jump to dashboard.
  useEffect(() => {
    if (getSession()) router.replace("/dashboard");
  }, [router]);

  // Show attempts remaining banner on mount and after each attempt.
  useEffect(() => {
    const a = getLoginAttemptInfo();
    if (a.attemptsLeft < 3) setAttemptsLeft(a.attemptsLeft);
  }, []);

  // Disable form for the remainder of the lockout window if currently locked.
  const [lockedUntil, setLockedUntil] = useState<number>(0);
  useEffect(() => {
    const a = getLoginAttemptInfo();
    setLockedUntil(a.lockedUntil);
  }, [attemptsLeft]);
  const isLocked = lockedUntil > Date.now();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isLocked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isLocked]);
  const secondsLeft = isLocked
    ? Math.max(0, Math.ceil((lockedUntil - now) / 1000))
    : 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setBusy(true);
    // Micro-delay so the busy state is visible even on fast machines.
    window.setTimeout(() => {
      const result: LoginResult = login(email, password);
      setBusy(false);
      if (result.ok) {
        setAttemptsLeft(3);
        router.replace("/dashboard");
        return;
      }
      setError(result.error);
      setAttemptsLeft(result.attemptsLeft);
      const updated = getLoginAttemptInfo();
      setLockedUntil(updated.lockedUntil);
    }, 250);
  }

  return (
    <>
      <NavBar />
      <main className="flex-1 bg-paper-white">
        <div className="page-container py-16 md:py-24">
          <div className="max-w-md mx-auto">
            <FeatureTag variant="iron" className="mb-6">
              Welcome back
            </FeatureTag>
            <h1 className="text-display-md font-bold text-obsidian">
              Sign in to Echo.
            </h1>
            <p className="mt-3 text-body text-obsidian/70">
              Your skills are waiting.
            </p>

            {info && (
              <div
                className="mt-6 px-4 py-3 rounded-2xl border border-mist-mint bg-mist-mint/30 text-body-sm text-obsidian"
                role="status"
              >
                {info}
              </div>
            )}
            {error && (
              <div
                className="mt-6 px-4 py-3 rounded-2xl border border-desert-clay bg-desert-clay/30 text-body-sm text-obsidian"
                role="alert"
              >
                {error}
              </div>
            )}
            {isLocked && (
              <div
                className="mt-3 px-4 py-3 rounded-2xl border border-obsidian/20 bg-iron/40 text-body-sm text-obsidian"
                role="alert"
              >
                Too many failed attempts. Try again in {secondsLeft}s.
              </div>
            )}

            <form className="mt-8 space-y-4" onSubmit={onSubmit} noValidate>
              <div>
                <label
                  htmlFor="email"
                  className="text-caption font-medium text-obsidian block mb-2"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  disabled={busy || isLocked}
                  className="w-full px-4 py-3 rounded-full border border-iron bg-paper-white text-body-sm focus:outline-none focus:border-obsidian transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="text-caption font-medium text-obsidian block mb-2"
                >
                  Password
                </label>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  name="password"
                  disabled={busy || isLocked}
                />
                {attemptsLeft < 3 && !isLocked && (
                  <p className="mt-2 text-caption text-obsidian/60">
                    {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left.
                  </p>
                )}
              </div>
              <Button
                variant="light"
                size="lg"
                type="submit"
                className="w-full"
                disabled={busy || isLocked}
              >
                {busy ? "Signing in…" : "Sign in →"}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3 text-caption text-obsidian/40">
              <div className="flex-1 h-px bg-iron" />
              or
              <div className="flex-1 h-px bg-iron" />
            </div>

            <GoogleButton intent="signin" />

            <p className="mt-3 text-center text-caption text-obsidian/40">
              You'll stay signed in. Echo remembers you across browser
              restarts.
            </p>

            <p className="mt-8 text-center text-body-sm text-obsidian/60">
              New to Echo?{" "}
              <Link
                href="/signup"
                className="text-obsidian font-medium underline-offset-4 hover:underline"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
