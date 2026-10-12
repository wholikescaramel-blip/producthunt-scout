import { GENERIC_COMMENT_WEIGHT, WEIGHT_MAKER, WEIGHT_RECENCY, WEIGHT_UPVOTES, WINDOW_DAYS } from "./config";
import type { ContactLinks, EnrichInput, PHComment, PHPost } from "./types";

const THANKS = /\b(thanks?|thank you|thx|ty|appreciate|cheers|welcome|glad you)\b/i;

/**
 * Weight of one maker comment. Every maker comment counts; generic ones
 * (short thank-yous / one-word acknowledgements) just count for less.
 */
export function makerCommentWeight(body: string): number {
  const text = body.trim();
  const generic = text.length < 20 || (text.length < 70 && THANKS.test(text) && !text.includes("?"));
  return generic ? GENERIC_COMMENT_WEIGHT : 1;
}

export function makerStats(post: PHPost): { count: number; weighted: number } {
  const mine: PHComment[] = post.comments.filter((c) => c.isMakerComment);
  return { count: mine.length, weighted: mine.reduce((s, c) => s + makerCommentWeight(c.body), 0) };
}

export function daysSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}

/** log-scaled, divided by the cohort max, so one viral launch doesn't flatten everyone else. */
function norm(value: number, max: number): number {
  return max <= 0 ? 0 : Math.log1p(value) / Math.log1p(max);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface ScoreRow {
  post: PHPost;
  makerComments: number;
  weightedComments: number;
  upvotePts: number; // out of 100 * WEIGHT_UPVOTES
  makerPts: number; // out of 100 * WEIGHT_MAKER
  recencyPts: number; // out of 100 * WEIGHT_RECENCY
  score: number;
}

/** 1 for a launch from this instant, falling linearly to 0 at the edge of the window. */
export function recencyFactor(launchedAt: string, now: number, windowDays: number): number {
  const ageDays = (now - new Date(launchedAt).getTime()) / 86_400_000;
  return Math.max(0, Math.min(1, 1 - ageDays / windowDays));
}

/** score = upvote pts + maker pts (each weight x log-scaled value / cohort max) + recency pts (weight x recency factor). */
export function scorePosts(posts: PHPost[], now = Date.now(), windowDays = WINDOW_DAYS): ScoreRow[] {
  const rows = posts.map((post) => {
    const m = makerStats(post);
    return { post, makerComments: m.count, weightedComments: m.weighted };
  });
  const maxVotes = Math.max(0, ...rows.map((r) => r.post.votesCount));
  const maxMaker = Math.max(0, ...rows.map((r) => r.weightedComments));
  return rows
    .map((r) => {
      const upvotePts = round1(100 * WEIGHT_UPVOTES * norm(r.post.votesCount, maxVotes));
      const makerPts = round1(100 * WEIGHT_MAKER * norm(r.weightedComments, maxMaker));
      const recencyPts = round1(100 * WEIGHT_RECENCY * recencyFactor(r.post.launchedAt, now, windowDays));
      return { ...r, upvotePts, makerPts, recencyPts, score: round1(upvotePts + makerPts + recencyPts) };
    })
    .sort((a, b) => b.score - a.score || b.post.votesCount - a.post.votesCount);
}

const usable = (n?: string | null): n is string => !!n && n.trim() !== "" && n.trim() !== "[REDACTED]";

/** Maker first; if Product Hunt hides/omits makers, fall back to the hunter (labelled) or "Not listed". */
export function founderName(post: PHPost): string {
  const maker = post.makers.map((m) => m.name).find(usable);
  if (maker) return maker;
  if (usable(post.hunter)) return `${post.hunter} (hunter)`;
  return "Not listed";
}

/** Where to reach the founders. Product Hunt exposes no emails, so we link to public profiles only. */
export function contactLinks(post: PHPost): ContactLinks {
  const maker = post.makers.find((m) => usable(m.name));
  return {
    productHuntUrl: post.url,
    productWebsite: post.website || undefined,
    makerName: maker?.name,
    makerProfileUrl: maker?.username ? `https://www.producthunt.com/@${maker.username}` : undefined,
    makerTwitterUrl: maker?.twitterUsername ? `https://x.com/${maker.twitterUsername}` : undefined,
    makerWebsiteUrl: maker?.websiteUrl || undefined,
  };
}

const INTEGRATION_HINT = /integrat|slack|api|sync|connect|plugin|zapier|workflow|jira|notion|github|teams|calendar|standup|remote|team/i;

/** The only text Gemini is allowed to quote as evidence: tagline, description, and a few real comments. */
export function buildEnrichInput(post: PHPost): EnrichInput {
  const clip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 240);
  const makerSnips = post.comments
    .filter((c) => c.isMakerComment && c.body.trim().length >= 40)
    .sort((a, b) => b.body.length - a.body.length)
    .slice(0, 3)
    .map((c) => ({ from: "maker comment" as const, text: clip(c.body) }));
  const userSnips = post.comments
    .filter((c) => !c.isMakerComment && c.body.trim().length >= 40 && (c.body.includes("?") || INTEGRATION_HINT.test(c.body)))
    .slice(0, 3)
    .map((c) => ({ from: "comment" as const, text: clip(c.body) }));
  return {
    id: post.id,
    name: post.name,
    tagline: post.tagline,
    description: post.description.replace(/\s+/g, " ").trim().slice(0, 400),
    topics: post.topics,
    snippets: [...makerSnips, ...userSnips],
  };
}
