"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { DEFAULT_PROFILE, DEFAULT_TOPICS, INITIAL_SHOWN, MAX_TOPICS, SHOW_MORE_STEP, TOPICS, WEIGHT_MAKER, WEIGHT_RECENCY, WEIGHT_UPVOTES } from "@/lib/config";
import type { EnrichInput, Evidence, ScoredProduct, ScoutResponse } from "@/lib/types";

type Topic = { slug: string; label: string };
type Draft = { loading: boolean; message?: string; source?: "gemini" | "template"; error?: string; copied?: boolean };
type AngleOverride = { oneLiner: string; angle: string; evidence?: Evidence; source: "gemini" | "template" | "failed" };
type ContactedEntry = {
  id: string;
  name: string;
  founder: string;
  url: string;
  upvotes: number;
  xUrl?: string;
  profileUrl?: string;
  contactedAt: string;
};

const QUICK: Topic[] = TOPICS.map((t) => ({ slug: t.slug, label: t.label }));
const STORE_KEY = "ph-scout-contacted-v1";
const pct = (w: number) => Math.round(w * 100);

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
  const [openScores, setOpenScores] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, AngleOverride>>({});
  const requested = useRef<Set<string>>(new Set());

  const [view, setView] = useState<"list" | "contacted">("list");
  const [shown, setShown] = useState(INITIAL_SHOWN);
  const [contacted, setContacted] = useState<Record<string, ContactedEntry>>({});
  const [hydrated, setHydrated] = useState(false);

  // category search
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Topic[]>([]);
  const [searching, setSearching] = useState(false);
  const [capNote, setCapNote] = useState(false);

  const isSelected = (slug: string) => selected.some((t) => t.slug === slug);
  const chips = [...QUICK, ...selected.filter((t) => !QUICK.some((q) => q.slug === t.slug))];

  // "Contacted" is remembered in this browser (survives refreshes and new searches).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setContacted(JSON.parse(raw));
    } catch {
      /* storage unavailable: start empty */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(contacted));
    } catch {
      /* ignore */
    }
  }, [contacted, hydrated]);

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
    setOpenScores({});
    setOverrides({});
    requested.current = new Set();
    setShown(INITIAL_SHOWN);
    setView("list");
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

  // Merge on-demand angles into the ranked list.
  const products: ScoredProduct[] = (data?.products ?? []).map((p) => {
    const o = overrides[p.id];
    if (!o) return p;
    if (o.source === "failed") return { ...p, angleSource: "template", outreachAngle: "Angle could not be generated right now - press Show more again or try later." };
    return { ...p, oneLiner: o.oneLiner, outreachAngle: o.angle, evidence: o.evidence, angleSource: o.source };
  });
  const visible = products.filter((p) => !contacted[p.id]);
  const shownList = visible.slice(0, shown);
  const hiddenContacted = products.length - visible.length;

  // Write angles for rows that are about to be shown but weren't generated up front.
  const needIds = shownList.filter((p) => p.angleSource === "pending" && !requested.current.has(p.id)).map((p) => p.id);
  const needKey = needIds.join(",");
  useEffect(() => {
    if (!data || !needKey) return;
    const ids = needKey.split(",").slice(0, 10);
    ids.forEach((id) => requested.current.add(id));
    const items: EnrichInput[] = ids.map((id) => data.pending[id]).filter(Boolean);
    (async () => {
      try {
        const res = await fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: profileUsed, items }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setOverrides((o) => {
          const next = { ...o };
          for (const id of ids) {
            const it = json.items?.[id];
            next[id] = it ? { oneLiner: it.oneLiner, angle: it.angle, evidence: it.evidence, source: it.source } : { oneLiner: "", angle: "", source: "failed" };
          }
          return next;
        });
      } catch {
        setOverrides((o) => {
          const next = { ...o };
          for (const id of ids) next[id] = { oneLiner: "", angle: "", source: "failed" };
          return next;
        });
      }
    })();
  }, [needKey, data, profileUsed]);

  function markContacted(p: ScoredProduct) {
    setContacted((c) => ({
      ...c,
      [p.id]: {
        id: p.id,
        name: p.name,
        founder: p.founder,
        url: p.url,
        upvotes: p.upvotes,
        xUrl: p.contact.makerTwitterUrl,
        profileUrl: p.contact.makerProfileUrl,
        contactedAt: new Date().toISOString(),
      },
    }));
  }
  function undoContacted(id: string) {
    setContacted((c) => {
      const { [id]: _gone, ...rest } = c;
      return rest;
    });
  }

  async function makeDraft(p: ScoredProduct) {
    if (drafts[p.id]?.message) {
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
    const head = ["Rank", "Product", "Founder", "Description", "Upvotes", "Days since launch", "Maker comments", "Score", "Outreach angle", "URL"];
    const rows = visible.map((p) => [p.rank, p.name, p.founder, p.oneLiner, p.upvotes, p.daysSinceLaunch, p.makerComments, p.score, p.outreachAngle, p.url]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "outreach-list.csv";
    a.click();
  }

  const searchHits = hits.filter((h) => !isSelected(h.slug));
  const contactedList = Object.values(contacted).sort((a, b) => b.contactedAt.localeCompare(a.contactedAt));

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

      {(data || contactedList.length > 0) && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={view === "list"} className="tab" onClick={() => setView("list")}>Outreach list</button>
          <button role="tab" aria-selected={view === "contacted"} className="tab" onClick={() => setView("contacted")}>
            Contacted ({contactedList.length})
          </button>
        </div>
      )}

      {view === "contacted" && (
        <section>
          {contactedList.length === 0 ? (
            <div className="panel empty">Nobody marked as contacted yet. Use &ldquo;Mark contacted&rdquo; on a row and they&apos;ll show up here (and stay out of your list).</div>
          ) : (
            <div className="table-wrap">
              <table style={{ minWidth: 640 }}>
                <thead>
                  <tr><th>Product</th><th>Founder</th><th>Upvotes</th><th>Contacted on</th><th /></tr>
                </thead>
                <tbody>
                  {contactedList.map((c) => (
                    <tr key={c.id}>
                      <td className="name"><a href={c.url} target="_blank" rel="noreferrer">{c.name}</a></td>
                      <td>
                        {c.founder}
                        <div className="tag">
                          {c.profileUrl && <a href={c.profileUrl} target="_blank" rel="noreferrer">PH profile</a>}
                          {c.profileUrl && c.xUrl && " · "}
                          {c.xUrl && <a href={c.xUrl} target="_blank" rel="noreferrer">X</a>}
                        </div>
                      </td>
                      <td className="num">{c.upvotes}</td>
                      <td className="num">{new Date(c.contactedAt).toLocaleDateString()}</td>
                      <td><button className="ghost small" style={{ marginTop: 0 }} onClick={() => undoContacted(c.id)}>Undo</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="tag" style={{ marginTop: 8 }}>Saved in this browser only, so it persists across refreshes and new searches.</p>
        </section>
      )}

      {view === "list" && data && (
        <section>
          {data.warnings.map((w, i) => (
            <div key={i} className="banner warn">{w}</div>
          ))}
          <div className="actions">
            <p className="meta" style={{ margin: 0 }}>
              Showing {shownList.length} of {visible.length} ranked launches
              {hiddenContacted > 0 && ` (${hiddenContacted} contacted hidden)`} · {data.source === "live" ? "live Product Hunt data" : "saved snapshot"} · generated {new Date(data.generatedAt).toLocaleString()}
            </p>
            {visible.length > 0 && <button className="ghost" onClick={downloadCsv}>Download CSV</button>}
          </div>
          {visible.length === 0 ? (
            <div className="panel empty">
              {products.length > 0
                ? "Everyone in this list is marked as contacted. Try different categories."
                : "No launches found for these categories in the last 7 days. Try different or additional categories."}
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th><th>Product</th><th>Founder</th><th>Upvotes</th><th>Days since launch</th><th>Maker comments</th><th>Score</th><th>Suggested outreach angle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownList.map((p, idx) => {
                      const d = drafts[p.id];
                      const c = p.contact;
                      const b = p.breakdown;
                      const sOpen = !!openScores[p.id];
                      return (
                        <Fragment key={p.id}>
                          <tr className={d || sOpen ? "open" : undefined}>
                            <td className="num">{idx + 1}</td>
                            <td className="name">
                              <a href={p.url} target="_blank" rel="noreferrer">{p.name}</a>
                              <div className="desc">{p.oneLiner}</div>
                            </td>
                            <td>{p.founder}</td>
                            <td className="num">{p.upvotes}</td>
                            <td className="num">{p.daysSinceLaunch === 0 ? "today" : `${p.daysSinceLaunch}d`}</td>
                            <td className="num">{p.makerComments}</td>
                            <td className="num">
                              <button
                                className="score-btn"
                                aria-expanded={sOpen}
                                title="See how this score is made"
                                onClick={() => setOpenScores((s) => ({ ...s, [p.id]: !s[p.id] }))}
                              >
                                {p.score}
                              </button>
                            </td>
                            <td>
                              {p.angleSource === "pending" ? (
                                <span className="tag">Writing angle…</span>
                              ) : (
                                <>
                                  {p.outreachAngle}
                                  {p.evidence && (
                                    <div className="evidence">
                                      &ldquo;{p.evidence.quote}&rdquo; <span className="tag">- from their {p.evidence.from}</span>
                                    </div>
                                  )}
                                  <div className="tag">{p.angleSource === "gemini" ? "Gemini" : "template"}</div>
                                </>
                              )}
                              <div className="btn-row">
                                <button className="ghost small" onClick={() => makeDraft(p)} disabled={d?.loading || p.angleSource === "pending"}>
                                  {d?.loading ? "Drafting…" : d?.message ? "Hide draft" : "Draft message"}
                                </button>
                                <button className="ghost small" onClick={() => markContacted(p)}>Mark contacted</button>
                              </div>
                            </td>
                          </tr>
                          {sOpen && (
                            <tr className="draft-row">
                              <td />
                              <td colSpan={7}>
                                <div className="breakdown">
                                  <strong>Score {p.score}</strong> = upvotes <strong>{b.upvotePts}</strong> / {pct(WEIGHT_UPVOTES)} + maker responsiveness <strong>{b.makerPts}</strong> / {pct(WEIGHT_MAKER)} + recency <strong>{b.recencyPts}</strong> / {pct(WEIGHT_RECENCY)}
                                  <div className="tag">
                                    Upvotes: {p.upvotes}. Maker comments: {p.makerComments}
                                    {p.makerComments > 0 ? ` (${b.weightedComments} weighted; short thank-yous count 0.3)` : " (none found in the latest 40 comments, so 0 points)"}.
                                    Upvotes and maker points are scaled against the top launch in this list. Recency: launched {p.daysSinceLaunch === 0 ? "today" : `${p.daysSinceLaunch} day(s) ago`}, newer earns more.
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
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
                                      {c.makerTwitterUrl && <a className="ghost small link" href={c.makerTwitterUrl} target="_blank" rel="noreferrer">X</a>}
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
              {visible.length > shown && (
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <button className="ghost" onClick={() => setShown((n) => n + SHOW_MORE_STEP)}>
                    Show {Math.min(SHOW_MORE_STEP, visible.length - shown)} more
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <details className="how">
        <summary>How the score works</summary>
        <p>
          Score (0-100) = 55% upvotes + 30% maker responsiveness + 15% recency. Upvotes and maker points are log-scaled against the highest in the current list; recency falls from full points for a launch today to none at 7 days. Maker responsiveness is the number of
          comments written by the product&apos;s makers (latest 40 comments); short thank-you replies still count, at 0.3 of a full comment. A launch with no maker
          comments is never removed, it just earns 0 of the 30 maker points. Click any score to see its breakdown. Outreach angles quote the product&apos;s own text
          only when the quote can be found word-for-word in it; otherwise a plain angle is shown. Data comes from the Product Hunt API; angles and drafts are written by Gemini Flash.
        </p>
      </details>
    </main>
  );
}
