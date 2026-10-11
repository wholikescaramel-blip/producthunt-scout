import { GENERIC_COMMENT_WEIGHT, WEIGHT_MAKER, WEIGHT_UPVOTES } from "./config";
import type { PHComment, PHPost } from "./types";

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

export interface ScoreRow {
  post: PHPost;
  makerComments: number;
  makerResponsiveness: number;
  score: number;
}

export function scorePosts(posts: PHPost[]): ScoreRow[] {
  const rows = posts.map((post) => {
    const m = makerStats(post);
    return { post, makerComments: m.count, makerResponsiveness: m.weighted };
  });
  const maxVotes = Math.max(0, ...rows.map((r) => r.post.votesCount));
  const maxMaker = Math.max(0, ...rows.map((r) => r.makerResponsiveness));
  return rows
    .map((r) => ({
      ...r,
      score: Math.round(100 * (WEIGHT_UPVOTES * norm(r.post.votesCount, maxVotes) + WEIGHT_MAKER * norm(r.makerResponsiveness, maxMaker)) * 10) / 10,
    }))
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
