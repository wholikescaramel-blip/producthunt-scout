import { CANDIDATES, COMMENT_CHUNK, COMMENTS_PER_POST, PAGES_PER_TOPIC, PAGE_SIZE } from "./config";
import type { PHPost } from "./types";

const API = "https://api.producthunt.com/v2/api/graphql";
const TOKEN_URL = "https://api.producthunt.com/v2/oauth/token";

let cachedToken: { value: string; expires: number } | null = null;

async function getToken(): Promise<string> {
  if (process.env.PRODUCTHUNT_TOKEN) return process.env.PRODUCTHUNT_TOKEN;
  const id = process.env.PRODUCTHUNT_CLIENT_ID;
  const secret = process.env.PRODUCTHUNT_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Product Hunt credentials are not configured");
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.value;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Product Hunt token request failed (${res.status})`);
  const json = (await res.json()) as { access_token: string };
  cachedToken = { value: json.access_token, expires: Date.now() + 60 * 60 * 1000 };
  return json.access_token;
}

async function gql<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Product Hunt API ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message?: string; error_description?: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message ?? json.errors[0].error_description ?? "Product Hunt API error");
  return json.data as T;
}

// Pass 1: launch lists (no comments, so a page of 20 is cheap).
const LIST_QUERY = /* GraphQL */ `
  query List($topic: String!, $postedAfter: DateTime!, $after: String) {
    posts(topic: $topic, postedAfter: $postedAfter, order: VOTES, first: ${PAGE_SIZE}, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          name
          tagline
          description
          url
          website
          votesCount
          commentsCount
          createdAt
          featuredAt
          user { name }
          makers { id name username twitterUsername websiteUrl }
          topics(first: 6) { edges { node { slug } } }
        }
      }
    }
  }
`;

interface RawNode {
  id: string;
  name: string;
  tagline: string;
  description: string | null;
  url: string;
  website: string | null;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
  featuredAt: string | null;
  user: { name: string } | null;
  makers: { id: string; name: string; username: string; twitterUsername: string | null; websiteUrl: string | null }[];
  topics: { edges: { node: { slug: string } }[] };
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ");

function normalise(n: RawNode): PHPost {
  return {
    id: n.id,
    name: decode(n.name),
    tagline: decode(n.tagline),
    description: decode(n.description ?? ""),
    url: n.url.split("?")[0],
    website: n.website,
    votesCount: n.votesCount,
    commentsCount: n.commentsCount,
    launchedAt: n.featuredAt ?? n.createdAt,
    makers: n.makers,
    hunter: n.user?.name ?? null,
    topics: n.topics.edges.map((e) => e.node.slug),
    comments: [],
  };
}

async function fetchTopicList(topic: string, postedAfter: string, token: string): Promise<PHPost[]> {
  const out: PHPost[] = [];
  let after: string | null = null;
  for (let page = 0; page < PAGES_PER_TOPIC; page++) {
    let data: { posts: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; edges: { node: RawNode }[] } };
    try {
      data = await gql(token, LIST_QUERY, { topic, postedAfter, after });
    } catch (err) {
      if (page === 0) throw new Error(`Product Hunt API error for "${topic}": ${(err as Error).message}`);
      break; // a later page failing just means a shorter list
    }
    out.push(...data.posts.edges.map((e) => normalise(e.node)));
    if (!data.posts.pageInfo.hasNextPage || !data.posts.pageInfo.endCursor) break;
    after = data.posts.pageInfo.endCursor;
  }
  return out;
}

// Pass 2: comments for the top candidates, batched with aliases (body + author only keeps each query cheap).
async function attachComments(posts: PHPost[], token: string): Promise<number> {
  const chunks: PHPost[][] = [];
  for (let i = 0; i < posts.length; i += COMMENT_CHUNK) chunks.push(posts.slice(i, i + COMMENT_CHUNK));

  const results = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const fields = chunk
        .map((p, i) => `p${i}: post(id: "${p.id}") { comments(first: ${COMMENTS_PER_POST}, order: NEWEST) { edges { node { id body userId } } } }`)
        .join("\n");
      const data = await gql<Record<string, { comments: { edges: { node: { id: string; body: string; userId: string } }[] } } | null>>(token, `query { ${fields} }`);
      chunk.forEach((p, i) => {
        const makerIds = new Set(p.makers.map((m) => m.id));
        p.comments = (data[`p${i}`]?.comments.edges ?? []).map(({ node: c }) => ({
          id: c.id,
          body: decode(c.body ?? "").slice(0, 400),
          userId: c.userId,
          isMakerComment: makerIds.has(c.userId),
        }));
      });
    })
  );
  // number of launches whose comments could not be read
  return chunks.reduce((n, c, i) => (results[i].status === "rejected" ? n + c.length : n), 0);
}

export interface FetchResult {
  posts: PHPost[];
  warnings: string[];
}

/** Launches in the window for each topic (deduped, top candidates by upvotes) with their recent comments attached. */
export async function fetchLaunches(topics: string[], days: number): Promise<FetchResult> {
  const token = await getToken();
  const postedAfter = new Date(Date.now() - days * 86_400_000).toISOString();
  const warnings: string[] = [];
  const byId = new Map<string, PHPost>();

  const lists = await Promise.allSettled(topics.map((t) => fetchTopicList(t, postedAfter, token)));
  let failures = 0;
  lists.forEach((r, i) => {
    if (r.status === "fulfilled") {
      if (r.value.length === 0) warnings.push(`No launches found in the last ${days} days for "${topics[i]}".`);
      for (const p of r.value) if (!byId.has(p.id)) byId.set(p.id, p);
    } else {
      failures++;
      warnings.push(String(r.reason?.message ?? r.reason));
    }
  });
  if (failures === topics.length) throw new Error(warnings.join(" | "));

  const candidates = [...byId.values()].sort((a, b) => b.votesCount - a.votesCount).slice(0, CANDIDATES);
  const missed = await attachComments(candidates, token);
  if (missed > 0) warnings.push(`Maker comments could not be read for ${missed} launches; they are counted as 0 maker comments.`);
  return { posts: candidates, warnings };
}

export interface TopicHit {
  slug: string;
  name: string;
}

/** Search Product Hunt topics by keyword (for the category picker). */
export async function searchTopics(query: string): Promise<TopicHit[]> {
  const token = await getToken();
  const data = await gql<{ topics: { edges: { node: TopicHit }[] } }>(
    token,
    `query($q: String!) { topics(query: $q, first: 8, order: FOLLOWERS_COUNT) { edges { node { slug name } } } }`,
    { q: query }
  );
  return (data.topics.edges ?? []).map((e) => e.node);
}
