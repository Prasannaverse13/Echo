"use client";

import { motion, useInView } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useRef } from "react";

/* ---------------- WordsPullUp ---------------- */
interface WordsPullUpProps {
  text: string;
  className?: string;
  showAsterisk?: boolean;
  style?: React.CSSProperties;
}

export const WordsPullUp = ({
  text,
  className = "",
  showAsterisk = false,
  style,
}: WordsPullUpProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const words = text.split(" ");

  return (
    <div ref={ref} className={`inline-flex flex-wrap ${className}`} style={style}>
      {words.map((word, i) => {
        const isLast = i === words.length - 1;
        return (
          <motion.span
            key={i}
            initial={{ y: 20, opacity: 0 }}
            animate={isInView ? { y: 0, opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="inline-block relative"
            style={{ marginRight: isLast ? 0 : "0.25em" }}
          >
            {word}
            {showAsterisk && isLast && (
              <span className="absolute top-[0.65em] -right-[0.3em] text-[0.31em]">
                *
              </span>
            )}
          </motion.span>
        );
      })}
    </div>
  );
};

/* ---------------- WordsPullUpMultiStyle ---------------- */
interface Segment {
  text: string;
  className?: string;
}

interface WordsPullUpMultiStyleProps {
  segments: Segment[];
  className?: string;
  style?: React.CSSProperties;
}

export const WordsPullUpMultiStyle = ({
  segments,
  className = "",
  style,
}: WordsPullUpMultiStyleProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  const words: { word: string; className?: string }[] = [];
  segments.forEach((seg) => {
    seg.text.split(" ").forEach((w) => {
      if (w) words.push({ word: w, className: seg.className });
    });
  });

  return (
    <div
      ref={ref}
      className={`inline-flex flex-wrap justify-center ${className}`}
      style={style}
    >
      {words.map((w, i) => (
        <motion.span
          key={i}
          initial={{ y: 20, opacity: 0 }}
          animate={isInView ? { y: 0, opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          className={`inline-block ${w.className ?? ""}`}
          style={{ marginRight: "0.25em" }}
        >
          {w.word}
        </motion.span>
      ))}
    </div>
  );
};

/* ---------------- Nav links for Echo ---------------- */
const navItems = [
  { label: "Skills", href: "/skills" },
  { label: "Agents", href: "/agents" },
  { label: "Composer", href: "/compose" },
  { label: "Pricing", href: "/pricing" },
  { label: "Sign in", href: "/login" },
];

/* ---------------- EchoHero ----------------
   Full-bleed cinematic hero.
   - Background: real cinematic MP4 (with deep-teal gradient fallback so the
     page never looks broken if the video CDN hiccups)
   - Top: floating pill navbar
   - Bottom: massive serif headline with WordsPullUp char-by-char
   - Right: copy + arrow CTA that animates in with a 0.5/0.7s delay
   - Foreground: noise grain + dark-to-clear gradient overlay
   -------------------------------------------- */
export const EchoHero = () => {
  return (
    <section className="h-screen w-full">
      <div className="relative h-full w-full overflow-hidden rounded-2xl md:rounded-[2rem] bg-deep-teal">
        {/* Background video — desktop / large screens */}
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover z-0"
          src="/echo-hero-clean.mp4"
        />

        {/* Gradient ONLY at the bottom for headline contrast — top is fully transparent so the video shines */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 90%, rgba(0,0,0,0.75) 100%)",
          }}
        />

        {/* Solid-color fallback shown until the video loads (or if it fails).
            Uses the same warm-dark palette as the video so the transition is seamless. */}
        <div
          aria-hidden
          className="absolute inset-0 z-[-1]"
          style={{
            background:
              "linear-gradient(180deg, #2b1f17 0%, #4a2e1f 60%, #6b3a1d 100%)",
          }}
        />

        {/* Light noise grain — barely visible, just adds film texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[2] opacity-[0.06] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
            backgroundSize: "200px 200px",
          }}
        />

        {/* Floating liquid-glass pill navbar — Echo's nav */}
        <nav className="absolute left-1/2 top-4 sm:top-6 z-20 -translate-x-1/2 w-[min(92%,1100px)]">
          <div
            className="flex items-center justify-between gap-3 sm:gap-6 rounded-full border border-paper-white/25 px-4 py-2 sm:px-6 sm:py-2.5"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.10) 100%)",
              backdropFilter: "blur(24px) saturate(180%)",
              WebkitBackdropFilter: "blur(24px) saturate(180%)",
              boxShadow:
                "0 8px 32px 0 rgba(0,0,0,0.18), inset 0 1px 0 0 rgba(255,255,255,0.25)",
            }}
          >
            <span
              className="font-bold tracking-[-0.045em] text-base md:text-lg shrink-0"
              style={{ color: "#FFFFFF" }}
            >
              Echo
            </span>
            <div className="flex items-center gap-3 sm:gap-5 md:gap-7 overflow-x-auto">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-[10px] sm:text-xs md:text-sm font-medium transition-colors whitespace-nowrap"
                  style={{ color: "rgba(255, 255, 255, 0.78)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#FFFFFF")}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "rgba(255, 255, 255, 0.78)")
                  }
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </nav>

        {/* Hero content — bottom-left + bottom-right grid */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-6 sm:px-6 md:px-10 md:pb-10">
          <div className="grid grid-cols-12 items-end gap-4">
            <div className="col-span-12 lg:col-span-8">
              <h1
                className="font-medium leading-[0.85] tracking-[-0.06em] text-[26vw] sm:text-[24vw] md:text-[22vw] lg:text-[20vw] xl:text-[19vw] 2xl:text-[20vw]"
                style={{ color: "#F6F5F5" }}
              >
                <WordsPullUp text="Echo" showAsterisk />
              </h1>
            </div>

            <div className="col-span-12 flex flex-col gap-5 pb-6 lg:col-span-4 lg:pb-10">
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="text-xs sm:text-sm md:text-base"
                style={{ color: "#FFFFFF", lineHeight: 1.25 }}
              >
                Show it once. Run it forever. Echo watches you do a workflow
                on your screen, then re-runs it autonomously across thousands
                of inputs — in the background, while you do literally anything
                else.
              </motion.p>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-wrap items-center gap-3"
              >
                <a
                  href="/signup"
                  className="group inline-flex items-center gap-2 self-start rounded-full bg-paper-white py-2 pl-5 pr-1 text-sm font-medium text-obsidian transition-all hover:gap-3 sm:text-base"
                  style={{ color: "#000000" }}
                >
                  Try Echo free
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-obsidian transition-transform group-hover:scale-110 sm:h-10 sm:w-10">
                    <ArrowRight
                      className="h-4 w-4"
                      style={{ color: "#F6F5F5" }}
                    />
                  </span>
                </a>
                <a
                  href="/app/compose"
                  className="group inline-flex items-center gap-2 self-start rounded-full border border-paper-white/30 bg-obsidian/30 backdrop-blur-sm py-2 px-5 text-sm font-medium text-paper-white transition-all hover:bg-obsidian/50 sm:text-base"
                >
                  See it compose
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Bottom-left badge — the "All Things Agentic Hackathon" tag */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.0, ease: [0.16, 1, 0.3, 1] }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 hidden md:block"
        >
          <div className="flex items-center gap-2 rounded-full bg-obsidian/80 backdrop-blur-md border border-paper-white/20 px-3 py-1.5 text-caption text-paper-white/90 shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-teal animate-pulse" />
            All Things Agentic Hackathon · 2026
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default EchoHero;
