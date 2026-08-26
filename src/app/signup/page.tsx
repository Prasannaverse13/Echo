"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, NavBar, Footer, FeatureTag } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { signup, getSession } from "@/lib/auth/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getSession()) router.replace("/dashboard");
  }, [router]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill in your name, email, and password.");
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      const result = signup(name, email, password);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/dashboard");
    }, 250);
  }

  return (
    <>
      <NavBar />
      <main className="flex-1 bg-paper-white">
        <div className="page-container py-16 md:py-24">
          <div className="max-w-md mx-auto">
            <FeatureTag variant="desert-clay" className="mb-6">
              Free forever for the first 5 skills
            </FeatureTag>
            <h1 className="text-display-md font-bold text-obsidian">
              Teach Echo your first workflow.
            </h1>
            <p className="mt-3 text-body text-obsidian/70">
              60 seconds to set up. No credit card required.
            </p>

            {error && (
              <div
                className="mt-6 px-4 py-3 rounded-2xl border border-desert-clay bg-desert-clay/30 text-body-sm text-obsidian"
                role="alert"
              >
                {error}
              </div>
            )}

            <form className="mt-8 space-y-4" onSubmit={onSubmit} noValidate>
              <div>
                <label
                  htmlFor="name"
                  className="text-caption font-medium text-obsidian block mb-2"
                >
                  Full name
                </label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                  disabled={busy}
                  className="w-full px-4 py-3 rounded-full border border-iron bg-paper-white text-body-sm focus:outline-none focus:border-obsidian transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label
                  htmlFor="email"
                  className="text-caption font-medium text-obsidian block mb-2"
                >
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  disabled={busy}
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
                  autoComplete="new-password"
                  name="password"
                  disabled={busy}
                />
                <p className="mt-2 text-caption text-obsidian/50">
                  At least 8 characters with one number.
                </p>
              </div>
              <Button
                variant="light"
                size="lg"
                type="submit"
                className="w-full"
                disabled={busy}
              >
                {busy ? "Creating your Echo…" : "Create my Echo →"}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3 text-caption text-obsidian/40">
              <div className="flex-1 h-px bg-iron" />
              or
              <div className="flex-1 h-px bg-iron" />
            </div>

            <GoogleButton intent="signup" />

            <p className="mt-3 text-center text-caption text-obsidian/40">
              No password needed — Echo remembers you across browser
              restarts.
            </p>

            <p className="mt-8 text-center text-body-sm text-obsidian/60">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-obsidian font-medium underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
            <p className="mt-3 text-center text-caption text-obsidian/40">
              By signing up, you agree to Echo's Terms and Privacy Policy.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
