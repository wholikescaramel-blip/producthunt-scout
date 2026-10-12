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

const BW = 292, BH = 110;
// key: [row, col, title, lines]
const BOXES = {
  A: [0, 0, "Sets up a scan", ["Picks her product and up to 5", "categories, then clicks Generate"]],
  K: [0, 4, "Reaches out", ["Reviews the list, contacts founders,", "marks them as contacted"]],
  B: [1, 1, "Checks the request", ["Max 5 categories, last 7 days"]],
  E: [1, 3, "Scores and ranks", ["55% upvotes, 30% maker", "responsiveness, 15% recency"]],
  F: [1, 4, "Ranked list", ["Top 50, shown 20 at a time"]],
  C: [2, 2, "Live launches", ["New launches and their", "latest comments"]],
  G: [3, 3, "Writes outreach angles", ["One-liner, angle and draft", "message for each launch"]],
  H: [4, 4, "Remembers contacted", ["Saved in her browser and", "hidden from the main list"]],
};

const box = (k) => {
  const [r, c] = BOXES[k];
  return { x: cx(c) - BW / 2, y: cy(r) - BH / 2, cx: cx(c), cy: cy(r), r: cx(c) + BW / 2, l: cx(c) - BW / 2, t: cy(r) - BH / 2, b: cy(r) + BH / 2 };
};
const P = Object.fromEntries(Object.keys(BOXES).map((k) => [k, box(k)]));

// Only one arrow carries a label: "mark contacted".
const ARROWS = [
  { pts: [[P.A.r, P.A.cy], [P.B.cx, P.A.cy], [P.B.cx, P.B.t]] },
  { pts: [[P.B.r, P.B.cy], [P.C.cx, P.B.cy], [P.C.cx, P.C.t]] },
  { pts: [[P.C.r, P.C.cy], [1278, P.C.cy], [1278, P.E.cy], [P.E.l, P.E.cy]] },
  { pts: [[P.E.cx, P.E.b], [P.G.cx, P.G.t]], both: true },
  { pts: [[P.E.r, P.E.cy], [P.F.l, P.E.cy]] },
  { pts: [[P.F.cx, P.F.t], [P.F.cx, P.K.b]] },
  { pts: [[P.F.cx, P.F.b], [P.F.cx, P.H.t]], both: true, label: [P.F.cx, (P.F.b + P.H.t) / 2, "mark contacted"] },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const o = [];
o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, Helvetica, Arial, sans-serif">`);
o.push(`<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#64748b"/></marker></defs>`);
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
  o.push(`<path d="${d}" fill="none" stroke="#64748b" stroke-width="2.4" stroke-dasharray="9 6" marker-end="url(#ah)"${a.both ? ' marker-start="url(#ah)"' : ""}/>`);
}
for (const [k, [r, , title, lines]] of Object.entries(BOXES)) {
  const b = P[k], ink = ACTORS[r].ink;
  o.push(`<rect x="${b.x}" y="${b.y}" width="${BW}" height="${BH}" rx="12" fill="#fff" stroke="${ink}" stroke-width="3"/>`);
  o.push(`<text x="${b.cx}" y="${b.y + 34}" text-anchor="middle" font-size="17" font-weight="700" fill="#111827">${esc(title)}</text>`);
  lines.forEach((l, i) => o.push(`<text x="${b.cx}" y="${b.y + 62 + i * 22}" text-anchor="middle" font-size="14.5" fill="#374151">${esc(l)}</text>`));
}
for (const a of ARROWS.filter((x) => x.label)) {
  const [x, y, t] = a.label, w = t.length * 7.4 + 24;
  o.push(`<rect x="${x - w / 2}" y="${y - 13}" width="${w}" height="26" rx="13" fill="#fff" stroke="#cbd5e1"/>`);
  o.push(`<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="13" font-weight="600" fill="#334155">${esc(t)}</text>`);
}
o.push(`<text x="${W / 2}" y="${rowTop(5) + 44}" text-anchor="middle" font-size="14" fill="#475569">dashed arrow = data / action flow</text>`);
o.push(`</svg>`);
writeFileSync(new URL("./components-map.svg", import.meta.url), o.join("\n"));
writeFileSync(new URL("./components-map.html", import.meta.url), `<!doctype html><html><head><meta charset="utf-8"><title>Components Map</title><style>body{margin:0;background:#fff}svg{display:block;max-width:100%;height:auto}</style></head><body>${o.join("\n")}</body></html>`);
console.log("written");
