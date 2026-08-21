import * as React from "react";
import Link from "next/link";
import { Button } from "./Button";

const navLinks = [
  { label: "Skills", href: "/app/skills" },
  { label: "Agents", href: "/app/agents" },
  { label: "Composer", href: "/app/compose" },
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/pricing" },
];

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 bg-paper-white border-b border-iron">
      <div className="page-container flex items-center justify-between py-2">
        <Link
          href="/"
          className="text-2xl font-bold tracking-[-0.045em] text-obsidian"
        >
          Echo
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-base font-medium tracking-[-0.02em] text-obsidian hover:opacity-60 transition-opacity"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden sm:inline text-base font-medium tracking-[-0.02em] text-obsidian hover:opacity-60 transition-opacity"
          >
            Sign in
          </Link>
          <Button variant="light" size="sm" href="/signup">
            Get Started
          </Button>
        </div>
      </div>
    </header>
  );
}
