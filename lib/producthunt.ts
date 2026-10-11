import { POSTS_PER_TOPIC } from "./config";
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

const QUERY = /* GraphQL */ `
  query Scout($topic: String!, $postedAfter: DateTime!, $first: Int!) {
    posts(topic: $topic, postedAfter: $postedAfter, order: VOTES, first: $first) {
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
          comments(first: 15, order: NEWEST) {
            edges {
              node {
                id
                body
                createdAt
                parentId
                userId
              }
            }
          }
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
  comments: {
    edges: {
      node: {
        id: string;
        body: string;
        createdAt: string;
        parentId: string | null;
        userId: string;
      };
    }[];
  };
}

function normalise(n: RawNode): PHPost {
  const makerIds = new Set(n.makers.map((m) => m.id));
  return {
    id: n.id,
    name: n.name,
    tagline: n.tagline,
    description: n.description ?? "",
    url: n.url.split("?")[0],
    website: n.website,
    votesCount: n.votesCount,
    commentsCount: n.commentsCount,
    launchedAt: n.featuredAt ?? n.createdAt,
    makers: n.makers,
    hunter: n.user?.name ?? null,
    topics: n.topics.edges.map((e) => e.node.slug),
    comments: n.comments.edges.map(({ node: c }) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      parentId: c.parentId,
      userId: c.userId,
      // Authoritative signal: the commenter is one of this post's makers.
      isMakerComment: makerIds.has(c.userId),
    })),
  };
}

async function fetchTopic(topic: string, postedAfter: string, token: string): Promise<PHPost[]> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { topic, postedAfter, first: POSTS_PER_TOPIC } }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Product Hunt API ${res.status} for topic "${topic}"`);
  const json = (await res.json()) as { data?: { posts: { edges: { node: RawNode }[] } }; errors?: { message?: string; error_description?: string }[] };
  if (json.errors?.length) {
    const e = json.errors[0];
    throw new Error(`Product Hunt API error for "${topic}": ${e.message ?? e.error_description ?? "unknown"}`);
  }
  return (json.data?.posts.edges ?? []).map((e) => normalise(e.node));
}

export interface FetchResult {
  posts: PHPost[];
  warnings: string[];
}

/** Fetch launches in the window for each topic; a failing topic is skipped (with a warning), not fatal. */
export async function fetchLaunches(topics: string[], days: number): Promise<FetchResult> {
  const token = await getToken();
  const postedAfter = new Date(Date.now() - days * 86_400_000).toISOString();
  const warnings: string[] = [];
  const byId = new Map<string, PHPost>();

  const results = await Promise.allSettled(topics.map((t) => fetchTopic(t, postedAfter, token)));
  let failures = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      if (r.value.length === 0) warnings.push(`No launches found in the last ${days} days for "${topics[i]}".`);
      for (const p of r.value) if (!byId.has(p.id)) byId.set(p.id, p);
    } else {
      failures++;
      warnings.push(String(r.reason?.message ?? r.reason));
    }
  });
  if (failures === topics.length) throw new Error(warnings.join(" | "));
  return { posts: [...byId.values()], warnings };
}

export interface TopicHit {
  slug: string;
  name: string;
}

/** Search Product Hunt topics by keyword (for the category picker). */
export async function searchTopics(query: string): Promise<TopicHit[]> {
  const token = await getToken();
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "application/json" },
    body: JSON.stringify({
      query: `query($q: String!) { topics(query: $q, first: 8, order: FOLLOWERS_COUNT) { edges { node { slug name } } } }`,
      variables: { q: query },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Product Hunt API ${res.status}`);
  const json = (await res.json()) as { data?: { topics: { edges: { node: TopicHit }[] } }; errors?: { message?: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message ?? "topic search failed");
  return (json.data?.topics.edges ?? []).map((e) => e.node);
}
