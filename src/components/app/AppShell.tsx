"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FeatureTag } from "@/components/ui";
import { logout, type Session } from "@/lib/auth/auth";

const navSections = [
  {
    title: "Workspace",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "▣" },
      { label: "Skills", href: "/skills", icon: "✦" },
      { label: "Agents", href: "/agents", icon: "◈" },
    ],
  },
  {
    title: "Build",
    items: [
      { label: "Record", href: "/record", icon: "◉" },
      { label: "Composer", href: "/compose", icon: "❖" },
      { label: "Triggers", href: "/triggers", icon: "◇" },
    ],
  },
  {
    title: "Operate",
    items: [
      { label: "Runs", href: "/runs", icon: "▷" },
      { label: "Logs", href: "/logs", icon: "≡" },
      { label: "Integrations", href: "/integrations", icon: "⬡" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Settings", href: "/settings", icon: "⚙" },
    ],
  },
];

export function AppShell({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  function onLogout() {
    logout();
    router.push("/");
  }

  return (
    <div className="min-h-screen flex bg-bone">
      {/* Sidebar */}
      <aside className="hidden md:flex w-[240px] lg:w-[256px] flex-col bg-paper-white border-r border-iron sticky top-0 h-screen shrink-0">
        <div className="p-6 border-b border-iron">
          <Link
            href="/"
            className="text-2xl font-bold tracking-[-0.045em] text-obsidian"
          >
            Echo
          </Link>
          <p className="text-caption text-obsidian/50 mt-1">
            {session.name}
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-6">
          {navSections.map((section) => (
            <div key={section.title}>
              <h4 className="text-caption font-medium uppercase tracking-[-0.02em] text-obsidian/40 px-3 mb-2">
                {section.title}
              </h4>
              <ul className="space-y-1 w-full">
                {section.items.map((item) => {
                  const isActive =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-body-sm font-medium transition-colors w-full ${
                          isActive
                            ? "bg-obsidian text-paper-white"
                            : "text-obsidian hover:bg-bone"
                        }`}
                      >
                        <span className="text-lg leading-none opacity-70 shrink-0">
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-iron">
          <div className="bg-sandstone rounded-2xl p-4">
            <FeatureTag variant="iron" className="mb-2">
              Free plan
            </FeatureTag>
            <p className="text-caption text-obsidian/70">
              3 of 5 skills used
            </p>
            <div className="mt-2 h-1.5 bg-iron rounded-full overflow-hidden">
              <div className="h-full w-3/5 bg-obsidian rounded-full" />
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="text-caption font-medium text-obsidian underline-offset-4 hover:underline mt-3 inline-block"
            >
              Log out →
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
