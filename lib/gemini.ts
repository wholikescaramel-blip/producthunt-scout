import type { PHPost } from "./types";

export interface Enrichment {
  id: string;
  oneLiner: string;
  angle: string;
}

// Flash models, fastest-to-respond first. The first group is raced in parallel (first success wins),
// so one overloaded model (503) or slow model doesn't stall the request; the rest are sequential backups.
const PRIMARY = [...new Set([process.env.GEMINI_MODEL, "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-flash-lite-latest"].filter(Boolean) as string[])].slice(0, 3);
const BACKUP = ["gemini-3.8-flash", "gemini-3.1-flash-lite"].filter((m) => !PRIMARY.includes(m));
const BUDGET_MS = 30_000; // whole Gemini step must finish well inside the 60s function limit

async function callModel(model: string, key: string, prompt: string, timeoutMs: number): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status}`);
  const json = await res.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error(`${model}: empty response`);
  return text;
}

export async function callGemini(key: string, prompt: string): Promise<string> {
  const deadline = Date.now() + BUDGET_MS;
  let lastErr = "no model tried";
  const groups = [PRIMARY, ...BACKUP.map((m) => [m])];
  for (const group of groups) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) break;
    try {
      return await Promise.any(group.map((m) => callModel(m, key, prompt, Math.min(18_000, remaining))));
    } catch (e) {
      const errs = (e as AggregateError).errors ?? [e];
      lastErr = errs.map((x: Error) => x.message).join("; ");
    }
  }
  throw new Error(`${lastErr} (all Gemini models failed or time budget used up)`);
}

function templateEnrichment(p: PHPost, profileName: string): Enrichment {
  return {
    id: p.id,
    oneLiner: p.tagline,
    angle: `Propose a cross-promotion or integration between ${p.name} and ${profileName}: their users (${p.topics.slice(0, 2).join(", ") || "same audience"}) overlap with ours.`,
  };
}

type Items = Map<string, Enrichment & { source: "gemini" | "template" }>;
const BATCH_SIZE = 5;

/** Products are enriched in small parallel batches: each call is faster, and one slow batch can't sink the whole list. */
export async function enrich(
  posts: PHPost[],
  profile: { name: string; description: string }
): Promise<{ items: Items; warning?: string }> {
  const batches: PHPost[][] = [];
  for (let i = 0; i < posts.length; i += BATCH_SIZE) batches.push(posts.slice(i, i + BATCH_SIZE));
  const results = await Promise.all(batches.map((b) => enrichBatch(b, profile)));
  const items: Items = new Map();
  for (const r of results) for (const [k, v] of r.items) items.set(k, v);
  const fellBack = [...items.values()].filter((v) => v.source === "template").length;
  const detail = results.find((r) => r.warning)?.warning;
  return { items, warning: fellBack ? `Template angles used for ${fellBack} of ${posts.length} products. ${detail ?? ""}`.trim() : undefined };
}

/** One Gemini call for one batch. Any failure falls back to a template so the list still ships. */
async function enrichBatch(
  posts: PHPost[],
  profile: { name: string; description: string }
): Promise<{ items: Items; warning?: string }> {
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

export interface DraftInput {
  profile: { name: string; description: string };
  product: { name: string; tagline: string; founder: string; angle: string; daysSinceLaunch: number };
}

function templateDraft({ profile, product }: DraftInput): string {
  const hello = /^(Not listed|Unknown)/.test(product.founder) ? "Hi there" : `Hi ${product.founder.replace(/ \(hunter\)$/, "").split(" ")[0]}`;
  return `${hello} - congrats on launching ${product.name} on Product Hunt! I work on ${profile.name}. ${product.angle} Would you be open to a quick chat this week about it?`;
}

/** Short first-touch note for one founder. Falls back to a template if Gemini is unavailable. */
export async function draftMessage(input: DraftInput): Promise<{ message: string; source: "gemini" | "template"; warning?: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { message: templateDraft(input), source: "template", warning: "GEMINI_API_KEY is not set - template draft used." };
  const { profile, product } = input;
  const prompt = `Write a short, warm first-touch partnership message (max 70 words, plain text, no subject line, no placeholders in brackets) from a partnerships lead at "${profile.name}" to the founder of a newly launched product.

Sender's company: ${profile.description}
Founder: ${product.founder.replace(/ \(hunter\)$/, "")} ${/hunter|Not listed|Unknown/.test(product.founder) ? "(name uncertain - greet generically)" : ""}
Their product: ${product.name} - ${product.tagline}
Launched ${product.daysSinceLaunch === 0 ? "today" : product.daysSinceLaunch + " day(s) ago"} on Product Hunt.
Partnership angle to propose: ${product.angle}

Congratulate them briefly, make the angle concrete, end with one low-pressure ask. Respond with ONLY JSON: {"message": "..."}`;
  try {
    const parsed = JSON.parse(await callGemini(key, prompt)) as { message?: string };
    if (!parsed.message) throw new Error("empty message");
    return { message: parsed.message.trim(), source: "gemini" };
  } catch (err) {
    return { message: templateDraft(input), source: "template", warning: `Gemini failed (${(err as Error).message}) - template draft used.` };
  }
}
