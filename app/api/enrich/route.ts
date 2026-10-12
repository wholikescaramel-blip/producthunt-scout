import { NextResponse } from "next/server";
import { enrich } from "@/lib/gemini";
import type { EnrichInput } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request) {
  let body: Record<string, any> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const profile = { name: str(body.profile?.name, 80), description: str(body.profile?.description, 600) };
  const raw: unknown[] = Array.isArray(body.items) ? body.items.slice(0, 10) : [];
  const inputs: EnrichInput[] = raw.map((x: any) => ({
    id: str(x?.id, 20),
    name: str(x?.name, 120),
    tagline: str(x?.tagline, 300),
    description: str(x?.description, 400),
    topics: Array.isArray(x?.topics) ? x.topics.slice(0, 6).map((t: unknown) => str(t, 60)) : [],
    snippets: Array.isArray(x?.snippets)
      ? x.snippets.slice(0, 6).map((s: any) => ({ from: s?.from === "maker comment" ? "maker comment" : "comment", text: str(s?.text, 240) }))
      : [],
  })).filter((x) => x.id && x.name);
  if (!profile.name || inputs.length === 0) return NextResponse.json({ error: "Missing details." }, { status: 400 });

  const { items } = await enrich(inputs, profile);
  return NextResponse.json({ items: Object.fromEntries(items) });
}
