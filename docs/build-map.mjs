// Generates docs/components-map.svg and .html (run: node docs/build-map.mjs).
// Layout mirrors an Actor x Stage swimlane map.
import { writeFileSync } from "node:fs";

const W = 2000, H = 1130;
const GX = 38, AX = 250, RIGHT = 1962, TOP = 72, HEAD = 66;
const COLS = ["TRIGGER", "INPUT", "CONTEXT", "PROCESSING", "OUTPUT"];
const CW = (RIGHT - AX) / 5;
const cx = (i) => Math.round(AX + CW * i + CW / 2);
const ROW_H = 180, ROW0 = TOP + HEAD;
const rowTop = (r) => ROW0 + r * ROW_H;
const cy = (r) => rowTop(r) + ROW_H / 2;

const ACTORS = [
  { name: "Kavya", sub: "Partnerships lead", band: "#fdf1ea", ink: "#c2410c" },
  { name: "Scout App", sub: "Next.js on Vercel", band: "#eef2ff", ink: "#4338ca" },
  { name: "Product Hunt API", sub: "live launch data", band: "#e8f6f4", ink: "#0f766e" },
  { name: "Gemini Flash", sub: "LLM", band: "#f5effe", ink: "#7e22ce" },
  { name: "Browser storage", sub: "Kavya's browser", band: "#f1f5f9", ink: "#475569" },
];

const BW = 292, BH = 124;
// key: [row, col, title, lines]
const BOXES = {
  A: [0, 0, "Sets up a scan", ["Enters her product, picks up to 5", "categories (or searches any one),", "then clicks Generate"]],
  K: [0, 4, "Reaches out", ["Reads the list, drafts a message,", "copies it, opens the product's", "page or X, marks them contacted"]],
  B: [1, 1, "Checks the request", ["Max 5 categories, safe topic names,", "7-day window. Bad input gets a", "clear error message"]],
  E: [1, 3, "Scores and ranks (code)", ["60% upvotes + 40% maker comments.", "Thank-you replies count 0.3.", "Zero-maker launches stay, 0 pts"]],
  F: [1, 4, "Ranked list (top 50)", ["20 shown, then 10 more. Founder,", "upvotes, days since launch, angle", "and score breakdown"]],
  S: [2, 1, "Saved snapshot", ["Real launches saved earlier. Used", "only if the live API fails, with a", "banner on screen"]],
  C: [2, 2, "Live launches + comments", ["Last 7 days per category (paged),", "then the latest 40 comments for", "the top 60 launches by upvotes"]],
  G: [3, 3, "Writes angles + drafts", ["One-liner and outreach angle per", "launch. A quote must match their", "own text word for word, else plain"]],
  H: [4, 4, "Remembers who she contacted", ["Saved in her browser. Shown in the", "Contacted tab, hidden from the list", "even after a refresh or new search"]],
};

const box = (k) => {
  const [r, c] = BOXES[k];
  return { x: cx(c) - BW / 2, y: cy(r) - BH / 2, cx: cx(c), cy: cy(r), r: cx(c) + BW / 2, l: cx(c) - BW / 2, t: cy(r) - BH / 2, b: cy(r) + BH / 2 };
};
const P = Object.fromEntries(Object.keys(BOXES).map((k) => [k, box(k)]));

const ARROWS = [
  { pts: [[P.A.r, P.A.cy], [P.B.cx, P.A.cy], [P.B.cx, P.B.t]], label: [(P.A.r + P.B.cx) / 2, P.A.cy, "request"] },
  { pts: [[P.B.r, P.B.cy], [P.C.cx, P.B.cy], [P.C.cx, P.C.t]], label: [(P.B.r + P.C.cx) / 2, P.B.cy, "categories"] },
  { pts: [[P.S.r, P.S.cy], [P.C.l, P.C.cy]], fallback: true },
  { pts: [[P.C.r, P.C.cy], [1278, P.C.cy], [1278, P.E.cy], [P.E.l, P.E.cy]], label: [1278, (P.C.cy + P.E.cy) / 2, "launches + comments"] },
  { pts: [[1400, P.E.b], [1400, P.G.t]], label: [1400, 548, "text to quote"] },
  { pts: [[1500, P.G.t], [1500, P.E.b]], label: [1500, 625, "angle + quote"] },
  { pts: [[P.E.r, P.E.cy], [P.F.l, P.E.cy]] },
  { pts: [[P.F.cx, P.F.t], [P.F.cx, P.K.b]], label: [P.F.cx, (P.F.t + P.K.b) / 2, "list"] },
  { pts: [[1740, P.F.b], [1740, P.G.cy], [P.G.r, P.G.cy]], label: [1740, 620, "draft message"], both: true },
  { pts: [[1850, P.F.b], [1850, P.H.t]], label: [1850, 700, "mark contacted"], both: true },
];

const x_label = (a) => a.label;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const o = [];
o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, Helvetica, Arial, sans-serif">`);
o.push(`<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#64748b"/></marker>
<marker id="ahf" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/></marker></defs>`);
o.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
o.push(`<text x="${W / 2}" y="44" text-anchor="middle" font-size="22" font-weight="700" fill="#1f2937">ProductHunt Partnership Scout · Components Map</text>`);
o.push(`<rect x="${GX}" y="${TOP}" width="${RIGHT - GX}" height="${HEAD}" fill="#1e1b3a"/>`);
o.push(`<text x="${(GX + AX) / 2}" y="${TOP + 40}" text-anchor="middle" font-size="17" font-weight="700" letter-spacing="2" fill="#fff">ACTOR</text>`);
COLS.forEach((c, i) => o.push(`<text x="${cx(i)}" y="${TOP + 40}" text-anchor="middle" font-size="17" font-weight="700" letter-spacing="2" fill="#fff">${c}</text>`));
ACTORS.forEach((a, r) => {
  o.push(`<rect x="${AX}" y="${rowTop(r)}" width="${RIGHT - AX}" height="${ROW_H}" fill="${a.band}"/>`);
  o.push(`<rect x="${GX}" y="${rowTop(r)}" width="${AX - GX}" height="${ROW_H}" fill="#1e1b3a"/>`);
  o.push(`<line x1="${GX}" x2="${RIGHT}" y1="${rowTop(r)}" y2="${rowTop(r)}" stroke="#ffffff" stroke-width="2"/>`);
  o.push(`<text x="${(GX + AX) / 2}" y="${cy(r) - 2}" text-anchor="middle" font-size="19" font-weight="700" fill="#fff">${esc(a.name)}</text>`);
  o.push(`<text x="${(GX + AX) / 2}" y="${cy(r) + 22}" text-anchor="middle" font-size="14" fill="#c7c9e0">${esc(a.sub)}</text>`);
});
for (let i = 1; i < 5; i++) o.push(`<line x1="${AX + CW * i}" x2="${AX + CW * i}" y1="${ROW0}" y2="${rowTop(5)}" stroke="#d6dae6" stroke-dasharray="3 5"/>`);
for (const a of ARROWS) {
  const d = a.pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  const col = a.fallback ? "#94a3b8" : "#64748b";
  o.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="2.4" stroke-dasharray="9 6" marker-end="url(#${a.fallback ? "ahf" : "ah"})"${a.both ? ' marker-start="url(#ah)"' : ""}/>`);
}
for (const [k, [r, , title, lines]] of Object.entries(BOXES)) {
  const b = P[k], ink = ACTORS[r].ink;
  o.push(`<rect x="${b.x}" y="${b.y}" width="${BW}" height="${BH}" rx="12" fill="#fff" stroke="${ink}" stroke-width="3"/>`);
  o.push(`<text x="${b.cx}" y="${b.y + 30}" text-anchor="middle" font-size="16" font-weight="700" fill="#111827">${esc(title)}</text>`);
  lines.forEach((l, i) => o.push(`<text x="${b.cx}" y="${b.y + 56 + i * 21}" text-anchor="middle" font-size="13.5" fill="#374151">${esc(l)}</text>`));
}
for (const a of ARROWS.filter((x) => x.label)) {
  const [x, y, t] = x_label(a), w = t.length * 7.2 + 22;
  o.push(`<rect x="${x - w / 2}" y="${y - 12}" width="${w}" height="24" rx="12" fill="#fff" stroke="#cbd5e1"/>`);
  o.push(`<text x="${x}" y="${y + 4.5}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#334155">${esc(t)}</text>`);
}
o.push(`<text x="${W / 2}" y="${rowTop(5) + 44}" text-anchor="middle" font-size="14" fill="#475569">dashed arrow = data / action flow  ·  grey = fallback path  ·  Product Hunt token and Gemini key stay on the server, never in the browser</text>`);
o.push(`</svg>`);
writeFileSync(new URL("./components-map.svg", import.meta.url), o.join("\n"));
writeFileSync(new URL("./components-map.html", import.meta.url), `<!doctype html><html><head><meta charset="utf-8"><title>Components Map</title><style>body{margin:0;background:#fff}svg{display:block;max-width:100%;height:auto}</style></head><body>${o.join("\n")}</body></html>`);
console.log("written");
