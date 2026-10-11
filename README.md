# ProductHunt Partnership Scout

Ranks Product Hunt launches from the last 7 days (in chosen categories) by upvotes and maker responsiveness, and uses Gemini Flash to write a one-line description and a suggested outreach angle for each.

## How it works
1. `POST /api/scout` pulls launches per category from the Product Hunt GraphQL API (votes, comments, makers).
2. Score (0-100) = 60% upvotes + 40% maker responsiveness, each log-scaled against the cohort max. Every maker comment counts; short thank-you replies count at 0.3.
3. One batched Gemini call writes the one-liner and outreach angle for each product (retries and falls back across Flash models, then to a template).
4. If Product Hunt is unreachable, the app serves a bundled real-data snapshot (`data/snapshot.json`) with a banner.

## Run locally
```bash
npm install
cp .env.example .env.local   # fill in PRODUCTHUNT_TOKEN and GEMINI_API_KEY
npm run dev
```

Other scripts: `npm run snapshot` (refresh the fallback data), `npm run test:scoring`.

## Environment variables
| Name | Purpose |
|---|---|
| `PRODUCTHUNT_TOKEN` | Product Hunt developer token |
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL` | Preferred Gemini Flash model (optional) |
