import { NextResponse } from "next/server";
import { DEFAULT_PROFILE, DEFAULT_TOPICS, MAX_TOPICS, TOPIC_SLUG_RE, WINDOW_DAYS } from "@/lib/config";
import { runScout } from "@/lib/scout";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // empty body -> defaults
  }

  const topics = Array.isArray(body.topics)
    ? [...new Set((body.topics as unknown[]).filter((t): t is string => typeof t === "string" && TOPIC_SLUG_RE.test(t)))]
    : DEFAULT_TOPICS;
  if (topics.length === 0) return NextResponse.json({ error: "Select at least one category." }, { status: 400 });
  if (topics.length > MAX_TOPICS) return NextResponse.json({ error: `Pick at most ${MAX_TOPICS} categories.` }, { status: 400 });

  const days = Math.min(Math.max(Number(body.days) || WINDOW_DAYS, 1), 7);
  const p = (body.profile ?? {}) as { name?: unknown; description?: unknown };
  const profile = {
    name: typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 80) : DEFAULT_PROFILE.name,
    description: typeof p.description === "string" && p.description.trim() ? p.description.trim().slice(0, 600) : DEFAULT_PROFILE.description,
  };

  try {
    return NextResponse.json(await runScout({ topics, days, profile }));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
