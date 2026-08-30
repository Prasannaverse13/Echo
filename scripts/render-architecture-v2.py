"""Render an architecture PNG for Devpost — v2.

Comprehensive diagram showing the full pipeline:
- User browser (Recorder + Composer)
- 4-stage MS Skill Recorder pipeline (Record → Describer → Builder → SKILL.md)
- All GCP services in use (Cloud Run, Firestore, Pub/Sub, Vertex AI)
- Headless browser worker
- Data flow
"""
from __future__ import annotations

import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

# ------------------------------------------------------------------
# Color palette (matches 11x.ai design tokens in globals.css)
# ------------------------------------------------------------------
COL_BG       = "#0B0E14"
COL_CARD     = "#161B24"
COL_CARD2    = "#1E2632"
COL_STROKE   = "#2E3744"
COL_TEXT     = "#F5F1E8"
COL_MUTED    = "#9BA3B0"
COL_ACCENT   = "#5EE0C5"  # electric mint
COL_ACCENT2  = "#F4A261"  # warm coral
COL_ACCENT3  = "#9D7CD8"  # lavender
COL_ACCENT4  = "#FFD166"  # gold
COL_PIPELINE = "#7AE582"  # bright green for the pipeline stages

# ------------------------------------------------------------------
# Layout: 2400 x 1600 PNG, scales nicely for Devpost
# ------------------------------------------------------------------
W, H = 2400, 1600
fig, ax = plt.subplots(figsize=(W / 100, H / 100), dpi=100)
ax.set_xlim(0, W)
ax.set_ylim(0, H)
ax.set_aspect("equal")
ax.axis("off")
fig.patch.set_facecolor(COL_BG)
ax.set_facecolor(COL_BG)


def card(x, y, w, h, title, sub="", accent=COL_ACCENT, body=None,
         title_size=18, sub_size=12, text_size=12, body_color=COL_TEXT,
         sub_color=COL_MUTED):
    box = FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.02,rounding_size=18",
        linewidth=1.6, edgecolor=COL_STROKE, facecolor=COL_CARD,
    )
    ax.add_patch(box)
    stripe = patches.Rectangle(
        (x, y), 7, h, linewidth=0, facecolor=accent, alpha=0.95
    )
    ax.add_patch(stripe)
    ax.text(
        x + 24, y + h - 26, title,
        fontsize=title_size, fontweight="bold", color=accent, va="top", family="DejaVu Sans",
    )
    if sub:
        ax.text(
            x + 24, y + h - 56, sub,
            fontsize=sub_size, color=sub_color, va="top", family="DejaVu Sans",
        )
    if body:
        ax.text(
            x + 24, y + 24, body,
            fontsize=text_size, color=body_color, va="bottom", family="DejaVu Sans",
        )


def arrow(x1, y1, x2, y2, label="", color=COL_MUTED, style="-|>", curve=0.0,
         label_offset=(0, 0), font_size=11, dashed=False, label_color=None):
    rad = curve
    ls = "--" if dashed else "-"
    arr = FancyArrowPatch(
        (x1, y1), (x2, y2),
        connectionstyle=f"arc3,rad={rad}",
        arrowstyle=style,
        mutation_scale=22,
        linewidth=2.0,
        color=color,
        linestyle=ls,
    )
    ax.add_patch(arr)
    if label:
        mx, my = (x1 + x2) / 2 + label_offset[0], (y1 + y2) / 2 + label_offset[1]
        ax.text(mx, my, label, fontsize=font_size,
                color=label_color or color, ha="center", va="center",
                family="DejaVu Sans", fontweight="bold")


# ============================================================
# Title bar
# ============================================================
ax.text(50, H - 50, "Echo", fontsize=64, fontweight="bold", color=COL_ACCENT, family="DejaVu Sans")
ax.text(220, H - 60, "Show it once. Run it forever.", fontsize=30, color=COL_TEXT, family="DejaVu Sans", va="top")
ax.text(W - 50, H - 50,
        "All Things Agentic Hackathon   ·   Gemini 3.5 + Vertex AI + 4× GCP",
        fontsize=18, color=COL_MUTED, family="DejaVu Sans", ha="right", va="top")

# A subtle horizontal divider
ax.plot([50, W - 50], [H - 110, H - 110], color=COL_STROKE, linewidth=1.0)

# ============================================================
# LAYER 1: USER BROWSER  (top, full width)
# ============================================================
ax.text(50, H - 145, "USER", fontsize=16, fontweight="bold", color=COL_MUTED, family="DejaVu Sans")

# Main browser card spans full width
card(
    50, H - 280, W - 100, 130,
    "User Browser  ·  Next.js 16 + React 19 + Tailwind v4",
    "17 pages  ·  record  ·  compose  ·  run  ·  logs  ·  agents  ·  skills  ·  triggers",
    accent=COL_ACCENT,
    body="screen capture (getDisplayMedia)  ·  MediaRecorder webm  ·  mic narration (optional)  ·  localStorage (skills/runs/agents/logs)",
    title_size=22, sub_size=14, text_size=13,
)

# Two small sub-cards inside: Recorder + Composer
card(80, H - 410, 1100, 100,
    "/record  ·  Skill Recorder",
    "screen + events + narration → Describer → Builder → SKILL.md",
    accent=COL_PIPELINE,
    body="Pipeline: 4 stages with human-in-the-loop review gates between each",
    title_size=16, sub_size=12, text_size=11,
)
card(1220, H - 410, W - 1320, 100,
    "/compose  ·  2×2 Parallel Composer",
    "4 independent agents, real headless browser, live progress",
    accent=COL_ACCENT2,
    body="Dispatch all 4 → real headless Chromium → screenshots, action log, real-time",
    title_size=16, sub_size=12, text_size=11,
)

# ============================================================
# LAYER 2: 4-STAGE PIPELINE (the heart of Echo)
# ============================================================
ax.text(50, H - 460, "PIPELINE", fontsize=16, fontweight="bold", color=COL_PIPELINE, family="DejaVu Sans")

# 4 stages
stage_w = 540
stage_h = 160
stage_gap = 30
stage_y = H - 660
stage_x_start = 50

stages = [
    ("1. Record",          "screen + events",        "Browser capture  ·  audio  ·  URL/title timeline",         COL_ACCENT,  "frameBlobs, webm, timeline"),
    ("2. Describer",        "analysis  ·  LLM",        "Gemini 3.5 Flash via Vertex AI",                              COL_PIPELINE, "intent + steps + confidence"),
    ("3. Builder",          "plan  ·  LLM",            "Generalize:  query → {{job_query}}  ·  N rows → iterate",   COL_ACCENT2, "tokens + steps + tools"),
    ("4. SKILL.md",         "portable artifact",       "Deterministic render:  {{id}} → literal  ·  values pills",  COL_ACCENT3, "uploaded to /skills, downloaded"),
]

for i, (title, sub, body, color, chips) in enumerate(stages):
    x = stage_x_start + i * (stage_w + stage_gap)
    card(x, stage_y, stage_w, stage_h,
         title, sub, accent=color,
         body=body, title_size=20, sub_size=13, text_size=12)
    # arrow connector between stages
    if i < 3:
        x1 = x + stage_w
        x2 = x + stage_w + stage_gap
        arrow(x1, stage_y + stage_h/2, x2, stage_y + stage_h/2,
              color=color, curve=0.0, font_size=12)

# Pipeline annotations: "Human approves" gates between stages
for i in range(3):
    x1 = stage_x_start + (i + 1) * stage_w + i * stage_gap + stage_gap/2
    x2 = x1
    ax.text(x1, stage_y - 10, "▼", fontsize=18, color=COL_ACCENT4, ha="center", va="top", family="DejaVu Sans", fontweight="bold")
    ax.text(x1, stage_y - 38, "user approves", fontsize=11, color=COL_ACCENT4, ha="center", va="top", family="DejaVu Sans", fontweight="bold")

# ============================================================
# LAYER 3: BACKEND  (Cloud Run services)
# ============================================================
ax.text(50, H - 700, "BACKEND", fontsize=16, fontweight="bold", color=COL_MUTED, family="DejaVu Sans")

card(
    50, H - 870, 1140, 160,
    "echo  (Next.js API + dashboard)",
    "Cloud Run  ·  scale 0-10  ·  public ingress  ·  ADC JSON env",
    accent=COL_ACCENT,
    body="5 routes:  /api/skills/reconstruct  ·  /api/skills/analyze  ·  /api/skills/build  ·  /api/skills/transcribe  ·  /api/agents/run  ·  /api/browser/preview",
    title_size=18, sub_size=13, text_size=12,
)
card(
    1220, H - 870, W - 1320, 160,
    "echo-worker  ·  browser-executor",
    "Cloud Run  ·  scale 0-20  ·  long-running headless Chromium",
    accent=COL_ACCENT2,
    body="Subscribes echo-runs  ·  invokes ADK agent per input  ·  @sparticuz/chromium + puppeteer-core  ·  60s browser idle keep-alive",
    title_size=18, sub_size=13, text_size=12,
)

# ============================================================
# LAYER 4: GCP SERVICES  (4 services used)
# ============================================================
ax.text(50, H - 920, "GOOGLE CLOUD PLATFORM", fontsize=16, fontweight="bold", color=COL_ACCENT, family="DejaVu Sans")

gcp_y = H - 1110
gcp_h = 170
gcp_w = 560
gcp_gap = 30
gcp_x_start = 50

gcp_services = [
    ("Vertex AI  +  AI Studio",  "gemini-3.5-flash",   "Describer + Builder  ·  vision + JSON output + tool calls",    COL_ACCENT,  "1B token free tier / month"),
    ("Firestore  (Native mode)",  "nam5  ·  default",  "skills · agents · runs · events  ·  best-effort mirror",          COL_PIPELINE, "localStorage is the source of truth"),
    ("Pub/Sub",                    "echo-runs topic",   "run.created · run.progress · run.completed  ·  worker subscribes", COL_ACCENT2, "Eventarc + Cloud Run trigger"),
    ("Cloud Run  ·  Artifact Reg  ·  Cloud Build  ·  Secret Mgr",  "CI/CD",  "docker build → push → deploy on push to main",                  COL_ACCENT3, "2M free requests / month"),
]
for i, (name, sub, body, color, chip) in enumerate(gcp_services):
    x = gcp_x_start + i * (gcp_w + gcp_gap)
    card(x, gcp_y, gcp_w, gcp_h, name, sub, accent=color,
         body=body, title_size=18, sub_size=13, text_size=12)

# ============================================================
# ARROWS — the data flow
# ============================================================

# User browser → Pipeline (Record)
arrow(
    80, H - 280, 80, H - 410,
    label="screen capture",
    color=COL_PIPELINE, curve=0.05, label_offset=(20, 0), font_size=12,
    label_color=COL_PIPELINE,
)

# Recorder + Composer → echo (Next.js API)
arrow(
    1200, H - 280, 620, H - 710,
    label="HTTPS  ·  JSON",
    color=COL_ACCENT, curve=0.18, label_offset=(0, 0), font_size=12,
)

# Pipeline stages 1→2→3→4 — already drawn above as connectors

# Pipeline → echo (API) for the LLM calls
arrow(
    1400, H - 580, 880, H - 710,
    label="Gemini calls",
    color=COL_ACCENT, curve=-0.10, label_offset=(0, -15), font_size=11,
    dashed=True,
)

# echo (API) → GCP services (Firestore, Vertex AI)
arrow(620, H - 870, 230, H - 940, label="writeDoc", color=COL_PIPELINE, curve=-0.05, label_offset=(0, 5), font_size=10)
arrow(700, H - 870, 800, H - 940, label="LLM calls", color=COL_ACCENT, curve=0.0, label_offset=(0, 5), font_size=10)
arrow(800, H - 870, 1400, H - 940, label="publish", color=COL_ACCENT2, curve=0.05, label_offset=(0, 5), font_size=10)

# echo-worker subscribes to Pub/Sub
arrow(1820, H - 870, 1820, H - 940, label="subscribe", color=COL_ACCENT2, curve=0.0, font_size=10)

# echo-worker → headless browser (browser-executor)
arrow(1700, H - 870, 1700, H - 940, label="headless Chromium", color=COL_ACCENT2, curve=0.0, font_size=10)

# echo-worker → Firestore (results)
arrow(1500, H - 870, 1000, H - 940, label="writeDoc", color=COL_PIPELINE, curve=0.0, font_size=10)

# ============================================================
# FOOTER
# ============================================================
ax.text(50, 80,
        "Live:  echo-one-liard.vercel.app     ·     Source:  github.com/Prasannaverse13/Echo     ·     Eval:  pnpm run eval:recorder  (64% on 6 fixtures)",
        fontsize=16, color=COL_MUTED, family="DejaVu Sans")
ax.text(50, 50,
        "Architecture lifted from Microsoft's open-source Skill Recorder (microsoft/skill-recorder), adapted from Electron to a web-only stack.",
        fontsize=13, color=COL_MUTED, family="DejaVu Sans", style="italic")

# Save
out_path = sys.argv[1] if len(sys.argv) > 1 else "docs/architecture.png"
os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
fig.savefig(out_path, dpi=150, facecolor=COL_BG, bbox_inches="tight", pad_inches=10)
print(f"WROTE {out_path}")
