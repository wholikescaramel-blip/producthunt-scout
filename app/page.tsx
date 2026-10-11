"use client";

import { Fragment, useEffect, useState } from "react";
import { DEFAULT_PROFILE, DEFAULT_TOPICS, MAX_TOPICS, TOPICS } from "@/lib/config";
import type { ScoredProduct, ScoutResponse } from "@/lib/types";

type Topic = { slug: string; label: string };
type Draft = { loading: boolean; message?: string; source?: "gemini" | "template"; error?: string; copied?: boolean };

const QUICK: Topic[] = TOPICS.map((t) => ({ slug: t.slug, label: t.label }));

function csvCell(v: string | number) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

export default function Home() {
  const [selected, setSelected] = useState<Topic[]>(QUICK.filter((t) => DEFAULT_TOPICS.includes(t.slug)));
  const [name, setName] = useState(DEFAULT_PROFILE.name);
  const [description, setDescription] = useState(DEFAULT_PROFILE.description);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ScoutResponse | null>(null);
  const [profileUsed, setProfileUsed] = useState({ name: DEFAULT_PROFILE.name, description: DEFAULT_PROFILE.description });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  // category search
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Topic[]>([]);
  const [searching, setSearching] = useState(false);
  const [capNote, setCapNote] = useState(false);

  const isSelected = (slug: string) => selected.some((t) => t.slug === slug);
  const chips = [...QUICK, ...selected.filter((t) => !QUICK.some((q) => q.slug === t.slug))];

  function toggle(t: Topic) {
    setCapNote(false);
    if (isSelected(t.slug)) return setSelected((s) => s.filter((x) => x.slug !== t.slug));
    if (selected.length >= MAX_TOPICS) return setCapNote(true);
    setSelected((s) => [...s, t]);
  }

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/topics?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setHits((json.topics ?? []).map((t: { slug: string; name: string }) => ({ slug: t.slug, label: t.name })));
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  async function run() {
    setLoading(true);
    setError(null);
    setDrafts({});
    try {
      const res = await fetch("/api/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics: selected.map((t) => t.slug), days: 7, profile: { name, description } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setData(json);
      setProfileUsed({ name, description });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function makeDraft(p: ScoredProduct) {
    if (drafts[p.id]?.message) {
      // toggle closed
      setDrafts((d) => {
        const { [p.id]: _gone, ...rest } = d;
        return rest;
      });
      return;
    }
    setDrafts((d) => ({ ...d, [p.id]: { loading: true } }));
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: profileUsed,
          product: { name: p.name, tagline: p.tagline, founder: p.founder, angle: p.outreachAngle, daysSinceLaunch: p.daysSinceLaunch },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setDrafts((d) => ({ ...d, [p.id]: { loading: false, message: json.message, source: json.source } }));
    } catch (e) {
      setDrafts((d) => ({ ...d, [p.id]: { loading: false, error: (e as Error).message } }));
    }
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setDrafts((d) => ({ ...d, [id]: { ...d[id], copied: true } }));
      setTimeout(() => setDrafts((d) => (d[id] ? { ...d, [id]: { ...d[id], copied: false } } : d)), 1800);
    } catch {
      /* clipboard blocked: user can still select the text */
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

  const searchHits = hits.filter((h) => !isSelected(h.slug));

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

        <label className="f">
          Categories <span className="tag">({selected.length}/{MAX_TOPICS} selected)</span>
        </label>
        <div className="chips">
          {chips.map((t) => (
            <button key={t.slug} type="button" className="chip" aria-pressed={isSelected(t.slug)} onClick={() => toggle(t)}>
              {t.label}
              {!QUICK.some((q) => q.slug === t.slug) && " ×"}
            </button>
          ))}
        </div>

        <div className="search">
          <input
            type="text"
            placeholder="Or search any Product Hunt category, e.g. fintech, crm, customer support…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search categories"
            maxLength={40}
          />
          {query.trim().length >= 2 && (
            <div className="hits" role="listbox">
              {searching && <div className="hit muted">Searching…</div>}
              {!searching && searchHits.length === 0 && <div className="hit muted">No matching categories.</div>}
              {searchHits.map((h) => (
                <button
                  key={h.slug}
                  type="button"
                  className="hit"
                  onClick={() => {
                    toggle(h);
                    setQuery("");
                    setHits([]);
                  }}
                >
                  {h.label} <span className="tag">{h.slug}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {capNote && <p className="tag" role="status">You can pick up to {MAX_TOPICS} categories. Remove one to add another.</p>}

        <button className="go" onClick={run} disabled={loading || selected.length === 0}>
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
            <div className="panel empty">No launches found for these categories in the last 7 days. Try different or additional categories.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Product</th><th>Founder</th><th>Upvotes</th><th>Days since launch</th><th>Maker comments</th><th>Score</th><th>Suggested outreach angle</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p) => {
                    const d = drafts[p.id];
                    const c = p.contact;
                    return (
                      <Fragment key={p.id}>
                        <tr className={d ? "open" : undefined}>
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
                            <button className="ghost small" onClick={() => makeDraft(p)} disabled={d?.loading}>
                              {d?.loading ? "Drafting…" : d?.message ? "Hide draft" : "Draft message"}
                            </button>
                          </td>
                        </tr>
                        {d && !d.loading && (
                          <tr className="draft-row">
                            <td />
                            <td colSpan={7}>
                              {d.error ? (
                                <div className="banner err">{d.error}</div>
                              ) : (
                                <div className="draft">
                                  <textarea
                                    value={d.message}
                                    onChange={(e) => setDrafts((all) => ({ ...all, [p.id]: { ...all[p.id], message: e.target.value } }))}
                                    aria-label={`Draft message to ${p.name}`}
                                  />
                                  <div className="draft-actions">
                                    <button className="go small" onClick={() => copy(p.id, d.message ?? "")}>{d.copied ? "Copied ✓" : "Copy message"}</button>
                                    <a className="ghost small link" href={c.productHuntUrl} target="_blank" rel="noreferrer">Open on Product Hunt</a>
                                    {c.makerProfileUrl && <a className="ghost small link" href={c.makerProfileUrl} target="_blank" rel="noreferrer">Maker profile</a>}
                                    {c.makerTwitterUrl && <a className="ghost small link" href={c.makerTwitterUrl} target="_blank" rel="noreferrer">Maker on X</a>}
                                    {(c.makerWebsiteUrl || c.productWebsite) && (
                                      <a className="ghost small link" href={c.makerWebsiteUrl || c.productWebsite} target="_blank" rel="noreferrer">Website</a>
                                    )}
                                    <span className="tag">{d.source === "gemini" ? "Written by Gemini" : "Template draft"} · Product Hunt doesn&apos;t share emails, so paste this wherever you reach them.</span>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
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
          featured date. Data comes from the Product Hunt API; outreach angles and drafts are written by Gemini Flash.
        </p>
      </details>
    </main>
  );
}
