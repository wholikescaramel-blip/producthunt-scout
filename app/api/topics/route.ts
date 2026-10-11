import { NextResponse } from "next/server";
import { searchTopics } from "@/lib/producthunt";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 40);
  if (q.length < 2) return NextResponse.json({ topics: [] });
  try {
    return NextResponse.json({ topics: await searchTopics(q) });
  } catch (err) {
    return NextResponse.json({ topics: [], error: (err as Error).message }, { status: 502 });
  }
}
