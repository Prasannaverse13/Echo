"use client";

import * as React from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Register once at module load
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * useReducedMotion — returns true if the user has prefers-reduced-motion enabled.
 * Animations should be no-ops in that case.
 */
function getInitialMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(getInitialMotion);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

/* ============================================================
   Reveal — fade/slide up child elements when they enter viewport
   ============================================================ */

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  duration?: number;
  as?: keyof React.JSX.IntrinsicElements;
}

export function Reveal({
  children,
  className = "",
  delay = 0,
  y = 32,
  duration = 0.9,
  as: Tag = "div",
}: RevealProps) {
  const ref = React.useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (!ref.current || reduced) return;
    const el = ref.current;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { autoAlpha: 0, y },
        {
          autoAlpha: 1,
          y: 0,
          duration,
          delay,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 88%",
            once: true,
          },
        }
      );
    }, el);
    return () => ctx.revert();
  }, [delay, y, duration, reduced]);

  // @ts-expect-error - dynamic tag
  return <Tag ref={ref} className={className}>{children}</Tag>;
}

/* ============================================================
   StaggerReveal — staggers a list of children on scroll
   ============================================================ */

interface StaggerRevealProps {
  children: React.ReactNode;
  className?: string;
  selector?: string;
  stagger?: number;
  y?: number;
  start?: string;
  delay?: number;
}

export function StaggerReveal({
  children,
  className = "",
  selector,
  stagger = 0.1,
  y = 40,
  start = "top 85%",
  delay = 0,
}: StaggerRevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (!ref.current || reduced) return;
    const el = ref.current;
    let targets: NodeListOf<Element> | HTMLCollection;
    if (selector) {
      // Handle "> div" style relative selectors by prefixing with :scope
      const sel = selector.startsWith(">") ? `:scope ${selector}` : selector;
      targets = el.querySelectorAll(sel);
    } else {
      targets = el.children;
    }

    if (!targets.length) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { autoAlpha: 0, y },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.8,
          stagger,
          delay,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start,
            once: true,
          },
        }
      );
    }, el);
    return () => ctx.revert();
  }, [selector, stagger, y, start, delay, reduced]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/* ============================================================
   CountUp — animates a number from 0 to value when in view
   ============================================================ */

interface CountUpProps {
  to: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function CountUp({
  to,
  duration = 2,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
}: CountUpProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (!ref.current) return;
    if (reduced) {
      if (ref.current) ref.current.textContent = `${prefix}${to.toFixed(decimals)}${suffix}`;
      return;
    }
    const el = ref.current;
    const obj = { v: 0 };
    const ctx = gsap.context(() => {
      gsap.to(obj, {
        v: to,
        duration,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 90%",
          once: true,
        },
        onUpdate: () => {
          el.textContent = `${prefix}${obj.v.toFixed(decimals)}${suffix}`;
        },
      });
    }, el);
    // Set initial state
    el.textContent = `${prefix}0${suffix}`;
    return () => ctx.revert();
  }, [to, duration, decimals, prefix, suffix, reduced]);

  return (
    <span ref={ref} className={className}>
      {prefix}0{suffix}
    </span>
  );
}

/* ============================================================
   Parallax — moves element at a different rate than scroll
   ============================================================ */

interface ParallaxProps {
  children: React.ReactNode;
  className?: string;
  speed?: number; // -1 to 1, negative = move slower than scroll
}

export function Parallax({
  children,
  className = "",
  speed = 0.3,
}: ParallaxProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (!ref.current || reduced) return;
    const el = ref.current;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { y: 0 },
        {
          y: () => -window.innerHeight * speed,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        }
      );
    }, el);
    return () => ctx.revert();
  }, [speed, reduced]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/* ============================================================
   Marquee — horizontally scrolling tag list
   ============================================================ */

interface MarqueeProps {
  children: React.ReactNode;
  className?: string;
  speed?: number; // pixels per second
  pauseOnHover?: boolean;
}

export function Marquee({
  children,
  className = "",
  speed = 40,
  pauseOnHover = true,
}: MarqueeProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (!ref.current || reduced) return;
    const el = ref.current;

    // Duplicate children so the loop is seamless
    const inner = el.querySelector(".marquee-track") as HTMLElement | null;
    if (!inner) return;

    const ctx = gsap.context(() => {
      const loop = gsap.to(inner, {
        x: "-50%",
        duration: () => inner.offsetWidth / 2 / speed,
        ease: "none",
        repeat: -1,
      });

      if (pauseOnHover) {
        el.addEventListener("mouseenter", () => loop.pause());
        el.addEventListener("mouseleave", () => loop.resume());
      }
    }, el);

    return () => ctx.revert();
  }, [speed, pauseOnHover, reduced]);

  return (
    <div
      ref={ref}
      className={`overflow-hidden ${className}`}
      style={{ maskImage: "linear-gradient(to right, transparent, black 5%, black 95%, transparent)" }}
    >
      <div className="marquee-track flex gap-2 w-max">
        {children}
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   SplitTextReveal — splits text into chars/words, animates in
   ============================================================ */

interface SplitTextRevealProps {
  text: string;
  className?: string;
  type?: "chars" | "words" | "chars,words" | "chars,words,lines";
  stagger?: number;
  delay?: number;
  y?: number;
}

export function SplitTextReveal({
  text,
  className = "",
  type = "chars,words",
  stagger = 0.025,
  delay = 0,
  y = 40,
}: SplitTextRevealProps) {
  const ref = React.useRef<HTMLHeadingElement>(null);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (!ref.current || reduced) return;
    const el = ref.current;

    let cancelled = false;
    let splitInstance: { revert: () => void } | null = null;

    (async () => {
      const SplitTextModule = await import("gsap/SplitText");
      if (cancelled) return;
      const SplitText = SplitTextModule.SplitText;
      gsap.registerPlugin(SplitText);

      const split = SplitText.create(el, { type, aria: "auto" });
      splitInstance = split;

      gsap.set(split.chars, { autoAlpha: 0, y });
      gsap.to(split.chars, {
        autoAlpha: 1,
        y: 0,
        duration: 0.7,
        stagger,
        delay,
        ease: "power3.out",
        scrollTrigger: {
          trigger: el,
          start: "top 90%",
          once: true,
        },
      });
    })();

    return () => {
      cancelled = true;
      splitInstance?.revert();
    };
  }, [text, type, stagger, delay, y, reduced]);

  // Render plain text — SplitText will split it on the client
  return (
    <h1 ref={ref} className={className}>
      {text}
    </h1>
  );
}

/* ============================================================
   SplitTextRevealCharCount — a faster way to do the hero
   ============================================================ */

interface HeroHeadingProps {
  line1: string;
  line2: string;
  className?: string;
}

export function HeroHeading({ line1, line2, className = "" }: HeroHeadingProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (!ref.current || reduced) return;
    const el = ref.current;

    let cancelled = false;
    let splitInstance: { revert: () => void } | null = null;

    (async () => {
      const SplitTextModule = await import("gsap/SplitText");
      if (cancelled) return;
      const SplitText = SplitTextModule.SplitText;
      gsap.registerPlugin(SplitText);

      const split = SplitText.create(el.querySelectorAll("h1, h2"), {
        type: "chars,words",
        aria: "auto",
      });
      splitInstance = split;

      gsap.from(split.chars, {
        autoAlpha: 0,
        y: 80,
        rotateX: -40,
        duration: 1.1,
        stagger: 0.02,
        ease: "power4.out",
      });
    })();

    return () => {
      cancelled = true;
      splitInstance?.revert();
    };
  }, [reduced]);

  return (
    <div ref={ref} className={className}>
      <h1>{line1}</h1>
      <h2>
        <em>{line2}</em>
      </h2>
    </div>
  );
}
