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
  createdAt: string;
  parentId: string | null;
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

export interface ScoredProduct {
  rank: number;
  id: string;
  name: string;
  url: string;
  founder: string;
  oneLiner: string;
  upvotes: number;
  daysSinceLaunch: number;
  makerComments: number; // raw count
  makerResponsiveness: number; // weighted count (generic replies weigh less)
  score: number; // 0-100
  outreachAngle: string;
  angleSource: "gemini" | "template";
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
  warnings: string[];
}
