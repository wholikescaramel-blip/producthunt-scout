// Product Hunt topic slugs (producthunt.com/topics/<slug>) for the categories in the brief.
export const TOPICS: { slug: string; label: string }[] = [
  { slug: "task-management", label: "Project management" },
  { slug: "human-resources", label: "HR tech" },
  { slug: "developer-tools", label: "Developer tools" },
  { slug: "messaging", label: "Team communication" },
  { slug: "productivity", label: "Productivity" },
];

export const DEFAULT_TOPICS = TOPICS.map((t) => t.slug);

export const DEFAULT_PROFILE = {
  name: "Async standup tool",
  description:
    "A B2B SaaS that helps remote teams run async standups. Partnership interest: tools in project management, HR tech, developer productivity and team communication that our users already work with.",
};

export const WINDOW_DAYS = 7;
export const POSTS_PER_TOPIC = 15;
export const MAX_RESULTS = 15;

// Score weights: upvotes and maker comments, as specified in the brief.
export const WEIGHT_UPVOTES = 0.6;
export const WEIGHT_MAKER = 0.4;
// A maker comment that is just a thank-you / generic reply still counts, at this weight.
export const GENERIC_COMMENT_WEIGHT = 0.3;
