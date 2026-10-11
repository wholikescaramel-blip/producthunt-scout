import { NextResponse } from "next/server";
import { draftMessage } from "@/lib/gemini";

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
  const product = {
    name: str(body.product?.name, 120),
    tagline: str(body.product?.tagline, 300),
    founder: str(body.product?.founder, 120) || "Not listed",
    angle: str(body.product?.angle, 400),
    daysSinceLaunch: Math.max(0, Number(body.product?.daysSinceLaunch) || 0),
  };
  if (!profile.name || !product.name) return NextResponse.json({ error: "Missing product details." }, { status: 400 });
  return NextResponse.json(await draftMessage({ profile, product }));
}
