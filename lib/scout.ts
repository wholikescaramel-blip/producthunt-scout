import snapshotFile from "../data/snapshot.json";
import { INITIAL_ENRICH, MAX_RESULTS } from "./config";
import { enrich, rateFit, type EnrichedItem } from "./gemini";
import { fetchLaunches } from "./producthunt";
import { applyFit, buildEnrichInput, buildFitInput, contactLinks, daysSince, founderName, scorePosts, type FitRow } from "./scoring";
import type { EnrichInput, PHPost, ScoredProduct, ScoutRequest, ScoutResponse } from "./types";

const snapshot = snapshotFile as unknown as { savedAt: string | null; posts: PHPost[] };

function toProduct(r: FitRow, rank: number, now: number, e?: EnrichedItem): ScoredProduct {
  const poor = r.fit === "poor";
  return {
    rank,
    id: r.post.id,
    name: r.post.name,
    url: r.post.url,
    founder: founderName(r.post),
    oneLiner: e?.oneLiner ?? r.post.tagline,
    upvotes: r.post.votesCount,
    daysSinceLaunch: daysSince(r.post.launchedAt, now),
    makerComments: r.makerComments,
    score: r.finalScore,
    baseScore: r.baseScore,
    fit: r.fit,
    fitRated: r.fitRated,
    fitReason: r.fitReason,
    fitFactor: r.fitFactor,
    breakdown: { upvotePts: r.upvotePts, makerPts: r.makerPts, recencyPts: r.recencyPts, weightedComments: Math.round(r.weightedComments * 10) / 10 },
    // Poor fits get no Gemini angle: the reason they were set aside is the useful text.
    outreachAngle: poor ? `Low fit: ${r.fitReason ?? "not a clear match for your product"}.` : e?.angle ?? "",
    evidence: e?.evidence,
    angleSource: poor ? "template" : e ? e.source : "pending",
    tagline: r.post.tagline,
    contact: contactLinks(r.post),
  };
}

export async function runScout(req: ScoutRequest): Promise<ScoutResponse> {
  const warnings: string[] = [];
  let posts: PHPost[];
  let source: ScoutResponse["source"] = "live";
  let now = Date.now();

  try {
    const live = await fetchLaunches(req.topics, req.days);
    posts = live.posts;
    warnings.push(...live.warnings);
  } catch (err) {
    // Live source unavailable -> serve the last real snapshot instead of failing.
    if (!snapshot.savedAt || snapshot.posts.length === 0) {
      throw new Error(`Product Hunt is unreachable and no snapshot is bundled: ${(err as Error).message}`);
    }
    source = "snapshot";
    now = new Date(snapshot.savedAt).getTime();
    posts = snapshot.posts.filter((p) => p.topics.some((t) => req.topics.includes(t)));
    warnings.push(`Live Product Hunt data unavailable (${(err as Error).message}). Showing a saved snapshot from ${snapshot.savedAt}.`);
  }

  // Keep only launches inside the window (the API filter is by creation date; we re-check by launch date).
  const inWindow = posts.filter((p) => daysSince(p.launchedAt, now) <= req.days);
  if (inWindow.length === 0) warnings.push("No launches matched these categories in the selected window.");

  // 1) traction score (55/30/15)  2) fit judgement  3) final rank = score x fit factor; poor fits set aside.
  const scored = scorePosts(inWindow, now, req.days);
  const { fits, warning: fitWarning } = await rateFit(scored.map((r) => buildFitInput(r.post)), req.profile);
  if (fitWarning) warnings.push(fitWarning);
  const { ranked: rankedAll, lowFit } = applyFit(scored, fits);
  const ranked = rankedAll.slice(0, MAX_RESULTS);
  const inputs = ranked.map((r) => buildEnrichInput(r.post));

  // Angles are written up front for the first batch; the rest are requested on demand ("Show more").
  const { items, warning } = await enrich(inputs.slice(0, INITIAL_ENRICH), req.profile);
  if (warning) warnings.push(warning);
  const pending: Record<string, EnrichInput> = {};

  return {
    generatedAt: new Date().toISOString(),
    source,
    snapshotAt: source === "snapshot" ? snapshot.savedAt ?? undefined : undefined,
    windowDays: req.days,
    topics: req.topics,
    totalFound: inWindow.length,
    warnings,
    pending,
    products: ranked.map((r, i) => {
      const e = items.get(r.post.id);
      if (!e) pending[r.post.id] = inputs[i];
      return toProduct(r, i + 1, now, e);
    }),
    lowFit: lowFit.slice(0, 30).map((r) => toProduct(r, 0, now)),
  };
}
