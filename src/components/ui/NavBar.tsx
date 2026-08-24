"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./Button";
import { getSession, logout, type Session } from "@/lib/auth/auth";

const navLinks = [
  { label: "Skills", href: "/skills" },
  { label: "Agents", href: "/agents" },
  { label: "Composer", href: "/compose" },
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/pricing" },
];

export function NavBar() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setSession(getSession());
    const onAuth = () => setSession(getSession());
    window.addEventListener("echo:auth", onAuth);
    return () => window.removeEventListener("echo:auth", onAuth);
  }, []);

  function onLogout() {
    logout();
    setSession(null);
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-50 px-4 pt-4 sm:px-6 sm:pt-6">
      <div
        className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 rounded-full border border-iron/60 px-4 py-2 sm:gap-6 sm:px-6"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.65) 100%)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          boxShadow:
            "0 8px 32px 0 rgba(11,37,42,0.08), inset 0 1px 0 0 rgba(255,255,255,0.6)",
        }}
      >
        <Link
          href="/"
          className="text-xl font-bold tracking-[-0.045em] text-obsidian shrink-0"
        >
          Echo
        </Link>
        <nav className="hidden md:flex items-center gap-7">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-base font-medium tracking-[-0.02em] text-obsidian/80 hover:text-obsidian transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {session ? (
            <>
              <span className="hidden sm:inline text-base font-medium tracking-[-0.02em] text-obsidian/80">
                {session.name}
              </span>
              <Button variant="outline-light" size="sm" onClick={onLogout}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden sm:inline text-base font-medium tracking-[-0.02em] text-obsidian/80 hover:text-obsidian transition-colors"
              >
                Sign in
              </Link>
              <Button variant="light" size="sm" href="/signup">
                Get Started
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
