"""Render an architecture PNG for Devpost.

Uses matplotlib to draw the Echo architecture diagram. No browser/mermaid dependency.
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
# Color palette (matches the 11x.ai design tokens in globals.css)
# ------------------------------------------------------------------
COL_BG       = "#0B0E14"   # obsidian
COL_CARD     = "#161B24"   # deep teal
COL_CARD2    = "#1E2632"   # dusty sky
COL_STROKE   = "#2E3744"   # ash
COL_TEXT     = "#F5F1E8"   # parchment
COL_MUTED     = "#9BA3B0"   # silver
COL_ACCENT   = "#5EE0C5"   # electric mint (primary)
COL_ACCENT2  = "#F4A261"   # warm coral
COL_ACCENT3  = "#9D7CD8"   # lavender

# ------------------------------------------------------------------
# Layout grid (designed for a 1800x1100 PNG, scales nicely on Devpost)
# ------------------------------------------------------------------
W, H = 1800, 1100
fig, ax = plt.subplots(figsize=(W / 100, H / 100), dpi=100)
ax.set_xlim(0, W)
ax.set_ylim(0, H)
ax.set_aspect("equal")
ax.axis("off")
fig.patch.set_facecolor(COL_BG)
ax.set_facecolor(COL_BG)


def card(x, y, w, h, title, sub="", accent=COL_ACCENT, body=None, sub_color=COL_MUTED, body_color=COL_TEXT, text_size=14, sub_size=11, title_size=14):
    """Draw a rounded card with a title and optional body text."""
    box = FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.02,rounding_size=14",
        linewidth=1.4, edgecolor=COL_STROKE, facecolor=COL_CARD,
    )
    ax.add_patch(box)
    # accent stripe on the left
    stripe = patches.Rectangle(
        (x, y), 6, h, linewidth=0, facecolor=accent, alpha=0.95
    )
    ax.add_patch(stripe)
    # title
    ax.text(
        x + 22, y + h - 22, title,
        fontsize=title_size, fontweight="bold", color=accent, va="top", family="DejaVu Sans",
    )
    if sub:
        ax.text(
            x + 22, y + h - 50, sub,
            fontsize=sub_size, color=sub_color, va="top", family="DejaVu Sans",
        )
    if body:
        ax.text(
            x + 22, y + 22, body,
            fontsize=text_size, color=body_color, va="bottom", family="DejaVu Sans",
        )


def arrow(x1, y1, x2, y2, label="", color=COL_MUTED, style="-|>", curve=0.0, label_offset=(0, 0), font_size=10, dashed=False):
    """Draw a curved arrow with optional label."""
    rad = curve
    if dashed:
        connectionstyle = f"arc3,rad={rad}"
        ls = "--"
    else:
        connectionstyle = f"arc3,rad={rad}"
        ls = "-"
    arr = FancyArrowPatch(
        (x1, y1), (x2, y2),
        connectionstyle=connectionstyle,
        arrowstyle=style,
        mutation_scale=18,
        linewidth=1.6,
        color=color,
        linestyle=ls,
    )
    ax.add_patch(arr)
    if label:
        mx, my = (x1 + x2) / 2 + label_offset[0], (y1 + y2) / 2 + label_offset[1]
        ax.text(mx, my, label, fontsize=font_size, color=color, ha="center", va="center",
                family="DejaVu Sans", fontweight="bold")


# ============================================================
# Title
# ============================================================
ax.text(40, H - 30, "Echo", fontsize=42, fontweight="bold", color=COL_ACCENT, family="DejaVu Sans")
ax.text(140, H - 38, "Show it once. Run it forever.", fontsize=22, color=COL_TEXT, family="DejaVu Sans", va="top")
ax.text(W - 40, H - 30, "All Things Agentic Hackathon  •  Gemini 3.5 + ADK + 4× GCP", fontsize=14, color=COL_MUTED, family="DejaVu Sans", ha="right", va="top")

# ============================================================
# Layer 1: User (top)
# ============================================================
card(
    60, H - 230, 700, 110,
    "User browser  ·  Next.js 16 + React 19",
    "17 pages  ·  record  ·  compose  ·  run  ·  logs  ·  triggers  ·  integrations",
    accent=COL_ACCENT,
    body="getDisplayMedia()  →  base64 JPEG frames every 2s",
)

# small status chips under the browser card
chip_x = 80
for label, color in [
    ("Landing / Pricing / Docs", COL_ACCENT),
    ("Dashboard / Skills / Agents", COL_ACCENT2),
    ("Record / Compose / Runs", COL_ACCENT3),
]:
    ax.add_patch(FancyBboxPatch(
        (chip_x, H - 285), 195, 32,
        boxstyle="round,pad=0.02,rounding_size=8",
        linewidth=0, facecolor=COL_CARD2, alpha=0.9,
    ))
    ax.text(chip_x + 10, H - 269, label, fontsize=10, color=color, va="center", family="DejaVu Sans", fontweight="bold")
    chip_x += 215

# ============================================================
# Layer 2: Cloud Run (middle)
# ============================================================
card(
    60, H - 480, 1680, 200,
    "Google Cloud Run  ·  us-central1  ·  project echo-hackathon-2026",
    "two services in one repo  ·  one cloudbuild.yaml on push to main",
    accent=COL_ACCENT2,
    body="",
)

# API service card
card(
    90, H - 470, 800, 170,
    "echo  (Next.js API + dashboard)",
    "scale 0–10  ·  public ingress  ·  ADC JSON env",
    accent=COL_ACCENT,
    body="/api/skills  ·  /api/agents  ·  /api/integrations  ·  /api/agents/run",
)

# Worker service card
card(
    920, H - 470, 800, 170,
    "echo-worker  (framework-free Node 20)",
    "scale 0–20  ·  --no-allow-unauthenticated  ·  min-instances=1",
    accent=COL_ACCENT2,
    body="subscribes echo-runs  →  invokes ADK agent per input  →  publishes progress",
)

# ============================================================
# Layer 3: GCP services (bottom)
# ============================================================
# 5 GCP services in a row
gcp_y = 60
gcp_h = 180
gcp_w = 320
gcp_gap = 18
gcp_x_start = 60

gcp_services = [
    ("Vertex AI",  "gemini-3.5-flash",  "fallback path + ADK agent", COL_ACCENT),
    ("AI Studio",  "generativelanguage.googleapis.com", "primary Gemini 3.5+ inference", COL_ACCENT2),
    ("Firestore",  "nam5 · (default)", "skills · agents · runs · events", COL_ACCENT3),
    ("Pub/Sub",    "echo-runs topic",   "run.created · progress · completed", COL_ACCENT),
    ("Artifact Reg + Secret Mgr + Cloud Build",  "docker images + gemini-key", "CI/CD on push to main", COL_ACCENT2),
]
for i, (name, sub, body, color) in enumerate(gcp_services):
    x = gcp_x_start + i * (gcp_w + gcp_gap)
    card(x, gcp_y, gcp_w, gcp_h, name, sub, accent=color, body=body, title_size=12, sub_size=10, text_size=10)

# ============================================================
# Arrows (the flow)
# ============================================================
# browser -> API
arrow(410, H - 230, 410, H - 300, label="HTTPS\nJSON", color=COL_ACCENT, curve=-0.05, label_offset=(0, -10), font_size=10)

# browser -> Worker (live progress subscription)
arrow(530, H - 230, 1300, H - 300, label="live progress\n(Firestore listener)", color=COL_MUTED, curve=0.20, label_offset=(-30, 0), font_size=9, dashed=True)

# API -> Worker (request lifecycle)
arrow(890, H - 380, 920, H - 380, label="", color=COL_ACCENT2, curve=0.0)

# API -> Pub/Sub
arrow(700, H - 300, 700, 240, label="publish run.created", color=COL_ACCENT, curve=0.05, label_offset=(60, 0), font_size=10)

# Pub/Sub -> Worker
arrow(1140, H - 300, 1140, 240, label="pull\nrun.created", color=COL_ACCENT, curve=-0.05, label_offset=(-50, 0), font_size=10)

# Worker -> Firestore (events)
arrow(1220, H - 300, 1220, 240, label="write\nevents", color=COL_ACCENT3, curve=0.10, label_offset=(-60, 0), font_size=9, dashed=True)

# Worker -> Firestore (run read)
arrow(1080, H - 300, 1080, 240, label="read\nrun", color=COL_ACCENT3, curve=-0.10, label_offset=(60, 0), font_size=9, dashed=True)

# API <-> AI Studio
arrow(380, H - 470, 220, 240, label="generateJson\nfallback", color=COL_ACCENT2, curve=-0.15, label_offset=(-60, 0), font_size=9, dashed=True)

# API <-> Vertex AI
arrow(540, H - 470, 540, 240, label="fallback", color=COL_ACCENT, curve=0.15, label_offset=(60, 0), font_size=9, dashed=True)

# API -> Firestore
arrow(700, H - 470, 700, 240, label="setDoc\nrun / skill / agent", color=COL_ACCENT3, curve=-0.10, label_offset=(80, 0), font_size=9, dashed=True)

# Worker -> AI Studio (ADK agent)
arrow(1140, H - 470, 540, 240, label="ADK agent\nstream", color=COL_ACCENT2, curve=0.20, label_offset=(-40, 0), font_size=9, dashed=True)

# ============================================================
# Bottom legend
# ============================================================
legend_y = 16
ax.text(60, legend_y, "Echo  ·  github.com/Prasannaverse13/Echo  ·  live: echo-one-liard.vercel.app", fontsize=12, color=COL_MUTED, va="bottom", family="DejaVu Sans")

# save
out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "docs", "architecture.png")
os.makedirs(os.path.dirname(out_path), exist_ok=True)
plt.savefig(out_path, dpi=100, facecolor=COL_BG, bbox_inches="tight", pad_inches=20)
print("WROTE", out_path)
