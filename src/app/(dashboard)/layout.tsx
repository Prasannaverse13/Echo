"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { getSession, type Session } from "@/lib/auth/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    setSession(s);
    setReady(true);
    const onAuth = () => {
      const updated = getSession();
      if (!updated) {
        router.replace("/login");
      } else {
        setSession(updated);
      }
    };
    window.addEventListener("echo:auth", onAuth);
    return () => window.removeEventListener("echo:auth", onAuth);
  }, [router, pathname]);

  if (!ready || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-white">
        <p className="text-body-sm text-obsidian/50">Loading…</p>
      </div>
    );
  }
  return <AppShell session={session}>{children}</AppShell>;
}
