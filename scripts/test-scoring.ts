import assert from "node:assert/strict";
import { makerCommentWeight, scorePosts } from "../lib/scoring";
import type { PHPost } from "../lib/types";

const mk = (id: string, votes: number, makerBodies: string[]): PHPost => ({
  id, name: id, tagline: "", description: "", url: "", votesCount: votes, commentsCount: makerBodies.length,
  launchedAt: new Date().toISOString(), makers: [{ id: "m", name: "M", username: "m" }], hunter: null, topics: [],
  comments: makerBodies.map((b, i) => ({ id: `${id}${i}`, body: b, createdAt: "", parentId: null, userId: "m", isMakerComment: true })),
});

// generic replies count, but for less
assert.equal(makerCommentWeight("Thanks!"), 0.3);
assert.equal(makerCommentWeight("Thank you so much for the support, really appreciate it"), 0.3);
assert.equal(makerCommentWeight("Great question - yes, we sync with Slack and Linear, and a Jira integration ships next month."), 1);

// edge cases: empty list, zero votes, zero maker comments
assert.deepEqual(scorePosts([]), []);
const zero = scorePosts([mk("a", 0, [])]);
assert.equal(zero[0].score, 0);

// more votes + more responsive team ranks higher
const r = scorePosts([mk("low", 10, ["ok"]), mk("high", 200, ["Answering: yes we support SSO via Okta and SAML.", "Thanks!"])]);
assert.equal(r[0].post.id, "high");
assert.ok(r[0].score <= 100 && r[1].score >= 0);
console.log("scoring tests passed");
