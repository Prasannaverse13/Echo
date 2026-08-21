import * as React from "react";

type PastelVariant = "dusty-sky" | "mist-mint" | "wisteria" | "desert-clay";
type CardSurface =
  | PastelVariant
  | "bone"
  | "sandstone"
  | "ash-blush"
  | "paper-white"
  | "obsidian"
  | "deep-teal";

interface FeatureCardProps {
  children: React.ReactNode;
  surface?: CardSurface;
  className?: string;
  padding?: "sm" | "md" | "lg";
}

const surfaceStyles: Record<CardSurface, string> = {
  "dusty-sky": "bg-dusty-sky text-obsidian",
  "mist-mint": "bg-mist-mint text-obsidian",
  wisteria: "bg-wisteria text-obsidian",
  "desert-clay": "bg-desert-clay text-obsidian",
  bone: "bg-bone text-obsidian",
  sandstone: "bg-sandstone text-obsidian",
  "ash-blush": "bg-ash-blush text-obsidian",
  "paper-white": "bg-paper-white text-obsidian hairline",
  obsidian: "bg-obsidian text-paper-white",
  "deep-teal": "bg-deep-teal text-paper-white",
};

const paddingStyles = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function FeatureCard({
  children,
  surface = "bone",
  className = "",
  padding = "lg",
}: FeatureCardProps) {
  return (
    <div
      className={`rounded-2xl ${surfaceStyles[surface]} ${paddingStyles[padding]} ${className}`}
    >
      {children}
    </div>
  );
}
