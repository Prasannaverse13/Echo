import * as React from "react";
import Link from "next/link";

const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Skills", href: "/app/skills" },
      { label: "Agents", href: "/app/agents" },
      { label: "Composer", href: "/app/compose" },
      { label: "Integrations", href: "/app/integrations" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Pricing", href: "/pricing" },
      { label: "Docs", href: "/docs" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Skill Library", href: "/docs/skills" },
      { label: "API Reference", href: "/docs/api" },
      { label: "Changelog", href: "/changelog" },
      { label: "Community", href: "/community" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-stone text-obsidian mt-auto">
      <div className="page-container py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div>
            <Link
              href="/"
              className="text-3xl font-bold tracking-[-0.045em] text-obsidian"
            >
              Echo
            </Link>
            <p className="mt-4 text-body-sm max-w-xs">
              Show it once. Run it forever.
            </p>
          </div>
          {footerColumns.map((col) => (
            <div key={col.title}>
              <h4 className="text-caption font-medium tracking-[-0.02em] uppercase opacity-60 mb-4">
                {col.title}
              </h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-body-sm hover:opacity-60 transition-opacity"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 pt-8 border-t border-stone/50 flex flex-col md:flex-row justify-between gap-4 text-caption">
          <p>© 2026 Echo. All rights reserved.</p>
          <p>Built for the All Things Agentic Hackathon.</p>
        </div>
      </div>
    </footer>
  );
}
