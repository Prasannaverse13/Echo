"use client";

import * as React from "react";
import { FeatureCard } from "@/components/ui";

/**
 * SkillFileUpload — drop-zone that parses a skill.md the user
 * downloaded (or grabbed from another Echo workspace) and pre-fills
 * the active composer with the goal + inputs from the file.
 *
 * The parser is intentionally small — it handles the format our
 * own skill-md generator produces, not a generic markdown parser.
 * If a field is missing it falls back to a sensible default so a
 * partial file still produces a usable composer card.
 */

interface ParsedSkill {
  name: string;
  description: string;
  goal: string;
  /** Raw markdown body, in case we want to surface it later. */
  body: string;
}

function parseSkillMd(md: string): ParsedSkill | null {
  // 1) YAML frontmatter
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return null;
  const fm = fmMatch[1];
  const body = fmMatch[2];

  // 2) name + description from frontmatter
  const name = readFrontmatterScalar(fm, "name") ?? "Imported skill";
  const fmDescription = readFrontmatterScalar(fm, "description");

  // 3) Goal from either frontmatter `goal:` or the first > quoted line
  //    in the body, or the first H1 / Description paragraph.
  const fmGoal = readFrontmatterScalar(fm, "goal");
  const quotedGoal = body.match(/^>\s*([^\n]+)/m)?.[1]?.trim();
  const descriptionMatch = body.match(/^## Description\s*\n+([\s\S]*?)\n##/m)?.[1]?.trim();
  const goal = fmGoal ?? quotedGoal ?? descriptionMatch ?? "";

  return {
    name,
    description: fmDescription ?? goal,
    goal,
    body,
  };
}

function readFrontmatterScalar(fm: string, key: string): string | null {
  // Match `key: value` where value is a single-line scalar.
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!m) return null;
  let v = m[1].trim();
  // Strip surrounding quotes if present
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

interface SkillFileUploadProps {
  onLoad: (parsed: ParsedSkill) => void;
}

export function SkillFileUpload({ onLoad }: SkillFileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.name.endsWith(".md") && !file.name.endsWith(".markdown")) {
      setError("Please upload a .md or .markdown file.");
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseSkillMd(text);
      if (!parsed) {
        setError("Couldn't parse the file. Make sure it has YAML frontmatter with at least a `name:` field.");
        return;
      }
      if (!parsed.goal) {
        setError("File parsed but no goal was found. Add a `## Description` paragraph or a `goal:` field in the frontmatter.");
        return;
      }
      onLoad(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read the file.");
    }
  };

  return (
    <div
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
      className={`rounded-2xl p-6 hairline transition-colors ${
        dragging ? "ring-2 ring-obsidian/40 bg-wisteria/60" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-caption font-medium uppercase opacity-60 mb-1">
            Load from skill.md
          </p>
          <p className="text-body-sm mb-3">
            Drop a previously-exported <code className="font-mono">skill.md</code> here to pre-fill the active composer.
            Echo will use the file's <code className="font-mono">## Description</code> as the goal.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={inputRef}
              type="file"
              accept=".md,.markdown,text/markdown"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 rounded-full bg-obsidian text-paper-white text-caption font-medium hover:bg-charcoal"
            >
              Choose file
            </button>
            <span className="text-caption text-obsidian/50">
              or drag-and-drop
            </span>
          </div>
          {error && (
            <p className="mt-2 text-caption text-desert-clay">⚠ {error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
