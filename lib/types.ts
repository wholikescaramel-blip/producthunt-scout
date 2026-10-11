export interface PHMaker {
  id: string;
  name: string;
  username: string;
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
  votesCount: number;
  commentsCount: number;
  launchedAt: string; // ISO
  makers: PHMaker[];
  hunter: string | null;
  topics: string[];
  comments: PHComment[];
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
