import type { PHPost } from "./types";

export interface Enrichment {
  id: string;
  oneLiner: string;
  angle: string;
}

// Preferred model first, then other Flash models; tried in order when one is overloaded or unavailable.
const MODELS = [...new Set([process.env.GEMINI_MODEL, "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-3.8-flash", "gemini-flash-lite-latest", "gemini-3.1-flash-lite"].filter(Boolean) as string[])];
const BUDGET_MS = 42_000; // whole Gemini step must finish well inside the 60s function limit

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGemini(key: string, prompt: string): Promise<string> {
  let lastErr = "no model tried";
  const deadline = Date.now() + BUDGET_MS;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 3000) throw new Error(`${lastErr} (time budget used up)`);
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
          }),
          signal: AbortSignal.timeout(Math.min(20_000, remaining)),
        });
        if (res.ok) {
          const json = await res.json();
          const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          if (text) return text;
          lastErr = `${model}: empty response`;
          break;
        }
        lastErr = `${model}: HTTP ${res.status}`;
        if (res.status === 429 || res.status === 503) {
          await sleep(800 * (attempt + 1));
          continue; // overloaded: retry once, then move to the next model
        }
        break; // 404 / 400 etc: this model won't work, try the next
      } catch (e) {
        lastErr = `${model}: ${(e as Error).message}`;
      }
    }
  }
  throw new Error(lastErr);
}

function templateEnrichment(p: PHPost, profileName: string): Enrichment {
  return {
    id: p.id,
    oneLiner: p.tagline,
    angle: `Propose a cross-promotion or integration between ${p.name} and ${profileName}: their users (${p.topics.slice(0, 2).join(", ") || "same audience"}) overlap with ours.`,
  };
}

/** One batched Gemini call for all products. Any failure falls back to a template so the list still ships. */
export async function enrich(
  posts: PHPost[],
  profile: { name: string; description: string }
): Promise<{ items: Map<string, Enrichment & { source: "gemini" | "template" }>; warning?: string }> {
  const items = new Map<string, Enrichment & { source: "gemini" | "template" }>();
  const fallback = (warning?: string) => {
    for (const p of posts) items.set(p.id, { ...templateEnrichment(p, profile.name), source: "template" });
    return { items, warning };
  };

  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallback("GEMINI_API_KEY is not set - using template outreach angles.");
  if (posts.length === 0) return { items };

  const products = posts.map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    description: p.description.slice(0, 400),
    topics: p.topics,
  }));

  const prompt = `You help a partnerships lead at this company:
"${profile.description}"

For each newly launched product below, return:
- "oneLiner": one plain-English sentence (max 18 words) saying what the product does.
- "angle": a specific outreach angle (max 30 words) for how OUR product could complement THEIRS (integration, co-marketing, bundle, referral). Be concrete, reference what the product actually does. If it is a direct competitor, say so and suggest a different angle.

Products:
${JSON.stringify(products)}

Respond with ONLY a JSON array: [{"id": "...", "oneLiner": "...", "angle": "..."}] with one entry per product id.`;

  try {
    const text = await callGemini(key, prompt);
    const parsed = JSON.parse(text) as Enrichment[];
    if (!Array.isArray(parsed)) throw new Error("Gemini returned non-array JSON");
    for (const e of parsed) {
      if (e && typeof e.id === "string" && e.angle && e.oneLiner) items.set(String(e.id), { ...e, source: "gemini" });
    }
    let missing = 0;
    for (const p of posts) {
      if (!items.has(p.id)) {
        missing++;
        items.set(p.id, { ...templateEnrichment(p, profile.name), source: "template" });
      }
    }
    return { items, warning: missing ? `Gemini skipped ${missing} product(s); template angles used for those.` : undefined };
  } catch (err) {
    return fallback(`Gemini failed (${(err as Error).message}) - using template outreach angles.`);
  }
}
