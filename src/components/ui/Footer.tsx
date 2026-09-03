import * as React from "react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-stone text-obsidian mt-auto">
      <div className="page-container py-12 md:py-16 flex flex-col items-center text-center">
        <Link
          href="/"
          className="text-3xl font-bold tracking-[-0.045em] text-obsidian"
        >
          Echo
        </Link>
      </div>
    </footer>
  );
}
