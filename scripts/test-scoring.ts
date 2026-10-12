import assert from "node:assert/strict";
import { verifyEvidence } from "../lib/gemini";
import { makerCommentWeight, scorePosts } from "../lib/scoring";
import type { EnrichInput, PHPost } from "../lib/types";

const mk = (id: string, votes: number, makerBodies: string[]): PHPost => ({
  id, name: id, tagline: "", description: "", url: "", votesCount: votes, commentsCount: makerBodies.length,
  launchedAt: new Date().toISOString(), makers: [{ id: "m", name: "M", username: "m" }], hunter: null, topics: [],
  comments: makerBodies.map((b, i) => ({ id: `${id}${i}`, body: b, userId: "m", isMakerComment: true })),
});

// generic replies count, but for less
assert.equal(makerCommentWeight("Thanks!"), 0.3);
assert.equal(makerCommentWeight("Thank you so much for the support, really appreciate it"), 0.3);
assert.equal(makerCommentWeight("Great question - yes, we sync with Slack and Linear, and a Jira integration ships next month."), 1);

// edge cases: empty list, zero votes, zero maker comments
assert.deepEqual(scorePosts([]), []);
const zero = scorePosts([mk("a", 0, [])]);
assert.equal(zero[0].upvotePts, 0);
assert.equal(zero[0].makerPts, 0);
assert.equal(zero[0].score, zero[0].recencyPts); // only recency points remain

// more votes + more responsive team ranks higher; breakdown adds up and respects the 60/40 caps
const r = scorePosts([mk("low", 10, ["ok"]), mk("high", 200, ["Answering: yes we support SSO via Okta and SAML.", "Thanks!"])]);
assert.equal(r[0].post.id, "high");
assert.ok(r[0].score <= 100 && r[1].score >= 0);
assert.ok(r[0].upvotePts <= 55 && r[0].makerPts <= 30 && r[0].recencyPts <= 15);
assert.ok(Math.abs(r[0].score - (r[0].upvotePts + r[0].makerPts + r[0].recencyPts)) < 0.11);

// zero maker comments are never excluded: still ranked, with 0 maker points shown explicitly
const none = scorePosts([mk("quiet", 500, []), mk("chatty", 5, ["We answer everything here, ask away about pricing or roadmap."])]);
assert.equal(none.length, 2);
assert.equal(none.find((x) => x.post.id === "quiet")!.makerPts, 0);

// recency: with identical votes and comments, the newer launch ranks higher; launches at the window edge earn 0 recency points
const day = 86_400_000, nowMs = Date.now();
const old = { ...mk("old", 100, ["A real answer about pricing and the roadmap."]), launchedAt: new Date(nowMs - 6.9 * day).toISOString() };
const fresh = { ...mk("fresh", 100, ["A real answer about pricing and the roadmap."]), launchedAt: new Date(nowMs - 0.1 * day).toISOString() };
const rr = scorePosts([old, fresh], nowMs, 7);
assert.equal(rr[0].post.id, "fresh");
assert.ok(rr[0].recencyPts > 14 && rr[1].recencyPts < 1.5);
assert.equal(scorePosts([{ ...old, launchedAt: new Date(nowMs - 9 * day).toISOString() }], nowMs, 7)[0].recencyPts, 0);

// evidence guard: only verbatim quotes from the product's own text are accepted
const input: EnrichInput = {
  id: "1", name: "Acme", tagline: "Plan sprints faster", description: "Acme syncs with Slack and Jira so teams never lose context.",
  topics: [], snippets: [{ from: "comment", text: "Does it work with Microsoft Teams? We are fully remote." }],
};
assert.deepEqual(verifyEvidence(input, "syncs with Slack and Jira"), { quote: "syncs with Slack and Jira", from: "description" });
assert.equal(verifyEvidence(input, "SYNCS with slack, and JIRA!")?.from, "description"); // case/punctuation-insensitive
assert.equal(verifyEvidence(input, "Does it work with Microsoft Teams?")?.from, "comment");
assert.equal(verifyEvidence(input, "integrates natively with Notion and Linear"), undefined); // invented -> rejected
assert.equal(verifyEvidence(input, "Slack"), undefined); // too short to count as evidence
assert.equal(verifyEvidence(input, undefined), undefined);
console.log("scoring + evidence tests passed");
