import * as React from "react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-stone text-obsidian mt-auto">
      <div className="page-container py-12 md:py-16">
        <div>
          <Link
            href="/"
            className="text-3xl font-bold tracking-[-0.045em] text-obsidian"
          >
            Echo
          </Link>
        </div>
        <div className="mt-12 pt-6 border-t border-stone/50 flex flex-col md:flex-row justify-end gap-4 text-caption">
          <p>Built for the All Things Agentic Hackathon.</p>
        </div>
      </div>
    </footer>
  );
}
