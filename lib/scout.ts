import snapshotFile from "../data/snapshot.json";
import { MAX_RESULTS } from "./config";
import { enrich } from "./gemini";
import { fetchLaunches } from "./producthunt";
import { contactLinks, daysSince, founderName, scorePosts } from "./scoring";
import type { PHPost, ScoutRequest, ScoutResponse } from "./types";

const snapshot = snapshotFile as { savedAt: string | null; posts: PHPost[] };

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

  const ranked = scorePosts(inWindow).slice(0, MAX_RESULTS);
  const { items, warning } = await enrich(
    ranked.map((r) => r.post),
    req.profile
  );
  if (warning) warnings.push(warning);

  return {
    generatedAt: new Date().toISOString(),
    source,
    snapshotAt: source === "snapshot" ? snapshot.savedAt ?? undefined : undefined,
    windowDays: req.days,
    topics: req.topics,
    totalFound: inWindow.length,
    warnings,
    products: ranked.map((r, i) => {
      const e = items.get(r.post.id)!;
      return {
        rank: i + 1,
        id: r.post.id,
        name: r.post.name,
        url: r.post.url,
        founder: founderName(r.post),
        oneLiner: e.oneLiner,
        upvotes: r.post.votesCount,
        daysSinceLaunch: daysSince(r.post.launchedAt, now),
        makerComments: r.makerComments,
        makerResponsiveness: Math.round(r.makerResponsiveness * 10) / 10,
        score: r.score,
        outreachAngle: e.angle,
        angleSource: e.source,
        tagline: r.post.tagline,
        contact: contactLinks(r.post),
      };
    }),
  };
}
