import { NextRequest, NextResponse } from "next/server";
import { isGcpAvailable, writeDoc } from "@/lib/gcp";

/**
 * POST /api/skills/save
 *
 * Persist a skill that the user created manually (no screen capture required).
 * Body: { skillId?, name, description, steps?, trigger?, integrations?, intent? }
 *
 * Returns: { ok: true, skill: <saved>, gcp: "connected" | "disabled" | "error" }
 *
 * This is the "create a skill by hand" path. It is the
 * non-screen-capture equivalent of /api/skills/reconstruct.
 *
 * The skill is:
 *   1. Always returned in the response (the client can also write to its
 *      local `echo.skills.<userId>` localStorage directly).
 *   2. Best-effort persisted to Firestore (collection: `skills`) when GCP
 *      is available. Failures are reported via the `gcp` field but never
 *      block the response.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  const rawDescription =
    typeof body.description === "string" ? body.description.trim() : "";

  if (!rawName) {
    return NextResponse.json(
      { ok: false, error: "Skill name is required." },
      { status: 400 }
    );
  }
  if (!rawDescription) {
    return NextResponse.json(
      { ok: false, error: "Description is required." },
      { status: 400 }
    );
  }

  const name = rawName.slice(0, 80);
  const description = rawDescription.slice(0, 500);

  const id =
    typeof body.skillId === "string" && body.skillId.length > 0
      ? body.skillId
      : `skill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const steps = Array.isArray(body.steps)
    ? body.steps
        .filter(
          (s: unknown) =>
            s && typeof s === "object" && typeof (s as Record<string, unknown>).title === "string"
        )
        .slice(0, 20)
        .map((s: Record<string, unknown>, i: number) => ({
          num: typeof s.num === "number" ? s.num : i + 1,
          title: String(s.title).slice(0, 120),
          detail: typeof s.detail === "string" ? String(s.detail).slice(0, 500) : "",
          at: typeof s.at === "string" ? s.at : "",
        }))
    : [];

  const skill = {
    id,
    name,
    description,
    intent: typeof body.intent === "string" ? body.intent.slice(0, 1000) : "",
    steps,
    trigger: typeof body.trigger === "string" ? body.trigger : "Manual",
    integrations: Array.isArray(body.integrations)
      ? body.integrations.filter((x: unknown) => typeof x === "string").slice(0, 20)
      : [],
    createdAt: new Date().toISOString(),
    source: "manual",
  };

  let gcp: "connected" | "disabled" | "error" = "disabled";
  if (isGcpAvailable()) {
    try {
      const ref = await writeDoc("skills", id, skill as unknown as Record<string, unknown>);
      gcp = ref ? "connected" : "error";
    } catch {
      gcp = "error";
    }
  }

  return NextResponse.json({ ok: true, skill, gcp });
}
