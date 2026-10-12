export interface PHMaker {
  id: string;
  name: string;
  username: string;
  twitterUsername?: string | null;
  websiteUrl?: string | null;
}

export interface PHComment {
  id: string;
  body: string;
  userId: string;
  isMakerComment: boolean;
}

export interface PHPost {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  website?: string | null;
  votesCount: number;
  commentsCount: number;
  launchedAt: string; // ISO
  makers: PHMaker[];
  hunter: string | null;
  topics: string[];
  comments: PHComment[];
}

export interface ContactLinks {
  productHuntUrl: string;
  productWebsite?: string;
  makerName?: string;
  makerProfileUrl?: string;
  makerTwitterUrl?: string;
  makerWebsiteUrl?: string;
}

/** Text Gemini may use (and the server later verifies quotes against). */
export interface EnrichInput {
  id: string;
  name: string;
  tagline: string;
  description: string;
  topics: string[];
  snippets: { from: "maker comment" | "comment"; text: string }[];
}

export interface Evidence {
  quote: string;
  from: string; // tagline | description | maker comment | comment
}

export interface ScoreBreakdown {
  upvotePts: number; // out of 60
  makerPts: number; // out of 40
  weightedComments: number;
}

export interface ScoredProduct {
  rank: number;
  id: string;
  name: string;
  url: string;
  founder: string;
  oneLiner: string;
  upvotes: number;
  daysSinceLaunch: number;
  makerComments: number; // raw count of maker comments
  score: number; // 0-100
  breakdown: ScoreBreakdown;
  outreachAngle: string;
  evidence?: Evidence;
  angleSource: "gemini" | "template" | "pending";
  tagline: string;
  contact: ContactLinks;
}

export interface ScoutRequest {
  topics: string[];
  days: number;
  profile: { name: string; description: string };
}

export interface ScoutResponse {
  generatedAt: string;
  source: "live" | "snapshot";
  snapshotAt?: string;
  windowDays: number;
  topics: string[];
  totalFound: number;
  products: ScoredProduct[];
  /** Inputs for products whose angle isn't written yet (ranks beyond the first batch); the client requests them on demand. */
  pending: Record<string, EnrichInput>;
  warnings: string[];
}
