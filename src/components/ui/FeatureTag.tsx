import * as React from "react";

type PastelVariant = "dusty-sky" | "mist-mint" | "wisteria" | "desert-clay";
type TagVariant = PastelVariant | "slate-teal" | "iron" | "obsidian";

interface FeatureTagProps {
  children: React.ReactNode;
  variant?: TagVariant;
  className?: string;
}

const variantStyles: Record<TagVariant, string> = {
  "dusty-sky": "bg-dusty-sky text-obsidian",
  "mist-mint": "bg-mist-mint text-obsidian",
  wisteria: "bg-wisteria text-obsidian",
  "desert-clay": "bg-desert-clay text-obsidian",
  "slate-teal": "bg-slate-teal text-paper-white",
  iron: "bg-iron text-obsidian",
  obsidian: "bg-obsidian text-paper-white",
};

export function FeatureTag({
  children,
  variant = "iron",
  className = "",
}: FeatureTagProps) {
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-lg text-caption font-medium tracking-[-0.02em] whitespace-nowrap ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
