"use client";

import { useState } from "react";
import { DEFAULT_PROFILE, DEFAULT_TOPICS, TOPICS } from "@/lib/config";
import type { ScoutResponse } from "@/lib/types";

function csvCell(v: string | number) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

export default function Home() {
  const [topics, setTopics] = useState<string[]>(DEFAULT_TOPICS);
  const [name, setName] = useState(DEFAULT_PROFILE.name);
  const [description, setDescription] = useState(DEFAULT_PROFILE.description);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ScoutResponse | null>(null);

  const toggle = (slug: string) => setTopics((t) => (t.includes(slug) ? t.filter((x) => x !== slug) : [...t, slug]));

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics, days: 7, profile: { name, description } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    if (!data) return;
    const head = ["Rank", "Product", "Founder", "Description", "Upvotes", "Days since launch", "Maker comments", "Score", "Outreach angle", "URL"];
    const rows = data.products.map((p) => [p.rank, p.name, p.founder, p.oneLiner, p.upvotes, p.daysSinceLaunch, p.makerComments, p.score, p.outreachAngle, p.url]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "outreach-list.csv";
    a.click();
  }

  return (
    <main>
      <h1>ProductHunt Partnership Scout</h1>
      <p className="sub">New launches from the last 7 days, ranked by upvotes and maker responsiveness, each with an outreach angle for your product.</p>

      <section className="panel">
        <div className="row">
          <div>
            <label className="f" htmlFor="pname">Your product</label>
            <input id="pname" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div>
            <label className="f" htmlFor="pdesc">What it does / who you want to partner with</label>
            <textarea id="pdesc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} />
          </div>
        </div>
        <label className="f">Categories</label>
        <div className="chips">
          {TOPICS.map((t) => (
            <button key={t.slug} type="button" className="chip" aria-pressed={topics.includes(t.slug)} onClick={() => toggle(t.slug)}>
              {t.label}
            </button>
          ))}
        </div>
        <button className="go" onClick={run} disabled={loading || topics.length === 0}>
          {loading ? "Scouting launches…" : "Generate outreach list"}
        </button>
      </section>

      {error && <div className="banner err" role="alert">{error}</div>}

      {data && (
        <section>
          {data.warnings.map((w, i) => (
            <div key={i} className="banner warn">{w}</div>
          ))}
          <div className="actions">
            <p className="meta" style={{ margin: 0 }}>
              {data.products.length} of {data.totalFound} launches shown · {data.source === "live" ? "live Product Hunt data" : "saved snapshot"} · generated {new Date(data.generatedAt).toLocaleString()}
            </p>
            {data.products.length > 0 && <button className="ghost" onClick={downloadCsv}>Download CSV</button>}
          </div>
          {data.products.length === 0 ? (
            <div className="panel empty">No launches found for these categories in the last 7 days. Try adding more categories.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Product</th><th>Founder</th><th>Upvotes</th><th>Days since launch</th><th>Maker comments</th><th>Score</th><th>Suggested outreach angle</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p) => (
                    <tr key={p.id}>
                      <td className="num">{p.rank}</td>
                      <td className="name">
                        <a href={p.url} target="_blank" rel="noreferrer">{p.name}</a>
                        <div className="desc">{p.oneLiner}</div>
                      </td>
                      <td>{p.founder}</td>
                      <td className="num">{p.upvotes}</td>
                      <td className="num">{p.daysSinceLaunch === 0 ? "today" : `${p.daysSinceLaunch}d`}</td>
                      <td className="num">{p.makerComments}</td>
                      <td className="num score">{p.score}</td>
                      <td>
                        {p.outreachAngle}
                        <div className="tag">{p.angleSource === "gemini" ? "Gemini" : "template"}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <details className="how">
        <summary>How the score works</summary>
        <p>
          Score (0-100) = 60% upvotes + 40% maker responsiveness, each log-scaled against the highest in the current list. Maker responsiveness is the number of
          comments written by the product&apos;s makers; short thank-you replies still count, at 0.3 of a full comment. Days since launch is measured from the
          featured date. Data comes from the Product Hunt API; outreach angles are written by Gemini Flash.
        </p>
      </details>
    </main>
  );
}
