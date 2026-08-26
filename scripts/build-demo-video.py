#!/usr/bin/env python3
"""
Echo demo video builder.

Strategy:
  1. Use PIL to render each segment as a sequence of frames (with title + subtitle
     + watermark burned in). This sidesteps ffmpeg's drawtext font-path gotchas.
  2. Use ffmpeg to encode the PNG sequence into an MP4 (libx264, yuv420p).
  3. Concatenate all segments with ffmpeg -c copy.

Run from the repo root (C:\\Users\\Prasa\\Downloads\\google\\echo) so the
architecture.png and font paths resolve correctly.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path("C:/Users/Prasa/Downloads/google/echo")
ASSETS = ROOT / "demo-assets"
OUT = ROOT / "demo-out"
OUT.mkdir(parents=True, exist_ok=True)
FRAMES = OUT / "frames"
if FRAMES.exists():
    shutil.rmtree(FRAMES)
FRAMES.mkdir(parents=True, exist_ok=True)

FFMPEG = Path(
    "C:/Users/Prasa/AppData/Local/Microsoft/WinGet/Packages/"
    "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/"
    "ffmpeg-8.1.1-full_build/bin/ffmpeg.exe"
)
FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"
FONT_REG = "C:/Windows/Fonts/arial.ttf"

W, H = 1280, 720
FPS = 30

# (input_image_or_None, duration_seconds, title, subtitle)
SEGMENTS = [
    (None, 8, "Echo", "Show it once. Run it forever."),
    (ASSETS / "00-landing.jpg", 14, "The hero", "A single line tells the story."),
    (ASSETS / "01-dashboard.jpg", 16, "Dashboard", "12 skills, 293 runs today, 98.4% success."),
    (ASSETS / "02-skills.jpg", 16, "Skill library", "Six reusable skills. 390 lifetime runs."),
    (ASSETS / "03-agents.jpg", 16, "Active sub-agents", "RFP Responder: 234/1000. Inbox Butler: 47/47."),
    (ASSETS / "04-compose.jpg", 16, "Composer", "Describe a goal. Echo composes the agent."),
    (ASSETS / "05-triggers.jpg", 14, "Triggers", "Event, schedule, webhook, or manual."),
    (ASSETS / "06-integrations.jpg", 16, "Integrations", "Google Workspace, Slack, Telegram  +  8 coming soon."),
    (ASSETS / "07-runs.jpg", 14, "Runs history", "Every run, every status, exportable to CSV."),
    (ASSETS / "08-logs.jpg", 14, "Live logs", "OpenTelemetry-compliant stream across all agents."),
    (ASSETS / "09-record.jpg", 16, "Teach by doing", "Record your workflow once. Echo runs it forever."),
    (ASSETS / "12-gcp-firestore.jpg", 16, "Proof: Google Cloud", "Firestore: 12+ real run documents persisted by the API."),
    (ASSETS / "13-gcp-pubsub.jpg", 14, "Proof: Pub/Sub", "Topic echo-runs carries run.created, run.progress, run.completed events."),
    (ROOT / "docs/architecture.png", 18, "Architecture", "Next.js 16, Cloud Run, Pub/Sub, Firestore, Gemini 3.5."),
    (None, 8, "echo-one-liard.vercel.app", "github.com/Prasannaverse13/Echo  -  Built for the All Things Agentic Hackathon"),
]


def make_title_card(title: str, subtitle: str) -> Image.Image:
    img = Image.new("RGB", (W, H), (10, 10, 15))
    draw = ImageDraw.Draw(img)
    # subtle radial-ish gradient via overlaid rectangles
    for i in range(0, 60):
        a = int(60 - i)
        draw.rectangle([W // 2 - 400 - i, H // 2 - 200 - i, W // 2 + 400 + i, H // 2 + 200 + i],
                       outline=(99, 102, 241), width=1)
    title_font = ImageFont.truetype(FONT_BOLD, 96)
    sub_font = ImageFont.truetype(FONT_REG, 32)
    title_w = draw.textlength(title, font=title_font)
    sub_w = draw.textlength(subtitle, font=sub_font)
    draw.text(((W - title_w) / 2, (H - 96) / 2 - 20), title, font=title_font, fill=(255, 255, 255))
    draw.text(((W - sub_w) / 2, (H - 96) / 2 + 90), subtitle, font=sub_font, fill=(170, 170, 170))
    return img


def make_image_slide(src: Path, title: str, subtitle: str) -> Image.Image:
    base = Image.open(src).convert("RGB")
    # Cover-scale to 1280x720
    bw, bh = base.size
    target_ratio = W / H
    src_ratio = bw / bh
    if src_ratio > target_ratio:
        # wider: crop sides
        new_w = int(bh * target_ratio)
        left = (bw - new_w) // 2
        base = base.crop((left, 0, left + new_w, bh))
    else:
        # taller: crop top/bottom
        new_h = int(bw / target_ratio)
        top = (bh - new_h) // 2
        base = base.crop((0, top, bw, top + new_h))
    base = base.resize((W, H), Image.LANCZOS)
    draw = ImageDraw.Draw(base)
    # top bar
    draw.rectangle([0, 0, W, 80], fill=(0, 0, 0))
    # subtle bottom bar with gradient (just use solid for speed)
    bottom = Image.new("RGBA", (W, 110), (0, 0, 0, 210))
    base.paste(bottom, (0, H - 110), bottom)
    draw = ImageDraw.Draw(base)
    title_font = ImageFont.truetype(FONT_BOLD, 44)
    sub_font = ImageFont.truetype(FONT_REG, 26)
    watermark_font = ImageFont.truetype(FONT_BOLD, 22)
    draw.text((40, 22), title, font=title_font, fill=(255, 255, 255))
    draw.text((40, H - 70), subtitle, font=sub_font, fill=(220, 220, 220))
    draw.text((W - 100, 30), "Echo", font=watermark_font, fill=(255, 255, 255))
    # accent line under top bar
    draw.rectangle([0, 78, W, 80], fill=(99, 102, 241))
    return base


def render_segment(i: int, src: Path | None, duration: int, title: str, subtitle: str) -> Path:
    if src is None:
        base = make_title_card(title, subtitle)
    else:
        base = make_image_slide(src, title, subtitle)
    # save frames
    seg_dir = FRAMES / f"seg-{i:02d}"
    seg_dir.mkdir(parents=True, exist_ok=True)
    n_frames = duration * FPS
    print(f"  rendering {n_frames} frames for segment {i}")
    # repeat the same image n_frames times
    for f in range(n_frames):
        base.save(seg_dir / f"frame-{f:05d}.png", "PNG", optimize=False)
    return seg_dir


def encode_segment(seg_dir: Path, duration: int) -> Path:
    out = OUT / f"seg-{seg_dir.name.split('-')[1]}.mp4"
    # PNG sequence is constant quality; libx264 qp 18 (visually lossless)
    cmd = [
        str(FFMPEG), "-y",
        "-framerate", str(FPS),
        "-i", str(seg_dir / "frame-%05d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "veryfast", "-crf", "18",
        "-r", str(FPS),
        str(out),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("STDERR:", r.stderr[-1500:])
        raise RuntimeError(f"ffmpeg encode failed for {seg_dir}")
    return out


def concat(segment_files: list[Path]) -> Path:
    list_file = OUT / "concat.txt"
    list_file.write_text("".join(f"file '{p.resolve().as_posix()}'\n" for p in segment_files))
    final = OUT / "echo-demo.mp4"
    cmd = [str(FFMPEG), "-y", "-f", "concat", "-safe", "0", "-i", str(list_file), "-c", "copy", str(final)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("STDERR:", r.stderr[-1500:])
        raise RuntimeError("ffmpeg concat failed")
    return final


def main():
    total_frames = 0
    seg_videos = []
    for i, (src, dur, title, subtitle) in enumerate(SEGMENTS):
        print(f"[{i+1}/{len(SEGMENTS)}] {title} ({dur}s)")
        seg_dir = render_segment(i, src, dur, title, subtitle)
        total_frames += dur * FPS
        video = encode_segment(seg_dir, dur)
        seg_videos.append(video)
        print(f"  -> {video.name} ({video.stat().st_size // 1024} KB)")
    print(f"Total frames: {total_frames} (~{total_frames // FPS}s)")
    final = concat(seg_videos)
    print(f"\nFinal: {final} ({final.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
