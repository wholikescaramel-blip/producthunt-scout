// Saves real, live Product Hunt data to data/snapshot.json (the offline fallback).
// Usage: npm run snapshot   (needs PRODUCTHUNT_TOKEN in the environment or .env.local)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { DEFAULT_TOPICS, WINDOW_DAYS } from "../lib/config";
import { fetchLaunches } from "../lib/producthunt";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const { posts, warnings } = await fetchLaunches(DEFAULT_TOPICS, WINDOW_DAYS);
  writeFileSync("data/snapshot.json", JSON.stringify({ savedAt: new Date().toISOString(), posts }, null, 1));
  console.log(`Saved ${posts.length} posts`, warnings.length ? `\nWarnings:\n- ${warnings.join("\n- ")}` : "");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
