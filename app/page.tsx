"use client";

import { gsap } from "gsap";
import { useEffect, useRef, useState } from "react";
import { Bloom, Petal } from "@/components/Flowers";
import { MeadowButton } from "@/components/MeadowButton";
import { ProductCard, type Draft } from "@/components/ProductCard";
import { DEFAULT_PROFILE, DEFAULT_TOPICS, INITIAL_SHOWN, MAX_TOPICS, SHOW_MORE_STEP, TOPICS } from "@/lib/config";
import type { EnrichInput, Evidence, ScoredProduct, ScoutResponse } from "@/lib/types";

type Topic = { slug: string; label: string };
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
const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const PETALS = Array.from({ length: 10 }, (_, i) => ({ id: i, size: 10 + ((i * 7) % 9), color: i % 3 === 0 ? "#e7c273" : i % 3 === 1 ? "#f0a898" : "#f7d3c9" }));

export default function Home() {
  const [stage, setStage] = useState<"landing" | "results">("landing");
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
  const [showLow, setShowLow] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [contacted, setContacted] = useState<Record<string, ContactedEntry>>({});
  const [hydrated, setHydrated] = useState(false);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Topic[]>([]);
  const [searching, setSearching] = useState(false);
  const [capNote, setCapNote] = useState(false);

  const landingRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const kbScroll = useRef(false);

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

  // landing: entrance, mouse parallax on the meadow photo, drifting petals
  useEffect(() => {
    if (stage !== "landing" || prefersReducedMotion()) return;
    const root = landingRef.current;
    if (!root) return;
    const ctx = gsap.context(() => {
      gsap.from(".hero-in", { y: 26, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.12 });
      gsap.from(".form-card", { y: 40, opacity: 0, duration: 1, ease: "power3.out", delay: 0.25 });
      gsap.utils.toArray<HTMLElement>(".petal").forEach((el, i) => {
        gsap.set(el, { x: gsap.utils.random(0, window.innerWidth), y: -40, rotation: gsap.utils.random(0, 360), opacity: 0.85 });
        gsap.to(el, { y: window.innerHeight + 60, duration: gsap.utils.random(13, 22), delay: i * 1.3, repeat: -1, ease: "none" });
        gsap.to(el, { x: `+=${gsap.utils.random(-120, 120)}`, rotation: `+=${gsap.utils.random(120, 300)}`, duration: gsap.utils.random(3.5, 6), yoyo: true, repeat: -1, ease: "sine.inOut" });
      });
    }, root);
    let qx: ((v: number) => void) | undefined, qy: ((v: number) => void) | undefined;
    if (bgRef.current) {
      qx = gsap.quickTo(bgRef.current, "x", { duration: 1.4, ease: "power3.out" });
      qy = gsap.quickTo(bgRef.current, "y", { duration: 1.4, ease: "power3.out" });
    }
    const onMove = (e: MouseEvent) => {
      qx?.((e.clientX / window.innerWidth - 0.5) * -22);
      qy?.((e.clientY / window.innerHeight - 0.5) * -14);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      ctx.revert();
    };
  }, [stage]);

  // results: header entrance
  useEffect(() => {
    if (stage !== "results" || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(".res-in", { y: 18, opacity: 0, duration: 0.7, ease: "power3.out", stagger: 0.08 });
    }, resultsRef);
    return () => ctx.revert();
  }, [stage]);

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

  function goResults(nextView: "list" | "contacted" = "list") {
    setView(nextView);
    if (prefersReducedMotion() || !landingRef.current) return setStage("results");
    // the timeout is a safety net: a throttled tab can stall tweens, and the page must never get stuck
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setStage("results");
    };
    gsap.to(landingRef.current, { opacity: 0, y: -24, duration: 0.5, ease: "power2.in", onComplete: finish });
    setTimeout(finish, 900);
  }

  async function run() {
    setLoading(true);
    setError(null);
    setDrafts({});
    setOpenScores({});
    setOverrides({});
    requested.current = new Set();
    setShown(INITIAL_SHOWN);
    setShowLow(false);
    setFocusedIdx(-1);
    if (bgRef.current && !prefersReducedMotion()) gsap.to(bgRef.current, { scale: 1.12, duration: 12, ease: "power1.out" });
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
      goResults("list");
    } catch (e) {
      setError((e as Error).message);
      if (bgRef.current && !prefersReducedMotion()) gsap.to(bgRef.current, { scale: 1.06, duration: 1.2, ease: "power2.out" });
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
  const lowVisible = (data?.lowFit ?? []).filter((p) => !contacted[p.id]);
  const shownRef = useRef<ScoredProduct[]>([]);
  shownRef.current = shownList;

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

  // keyboard: arrows / j / k move between cards
  useEffect(() => {
    if (stage !== "results" || view !== "list") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = shownRef.current.length;
      if (!n) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        kbScroll.current = true;
        setFocusedIdx((i) => Math.min(i + 1, n - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        kbScroll.current = true;
        setFocusedIdx((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, view]);
  useEffect(() => {
    if (!kbScroll.current || focusedIdx < 0) return;
    kbScroll.current = false;
    document.querySelector(`[data-index="${focusedIdx}"]`)?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [focusedIdx]);

  function markContacted(p: ScoredProduct) {
    setContacted((c) => ({
      ...c,
      [p.id]: { id: p.id, name: p.name, founder: p.founder, url: p.url, upvotes: p.upvotes, xUrl: p.contact.makerTwitterUrl, profileUrl: p.contact.makerProfileUrl, contactedAt: new Date().toISOString() },
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
    const head = ["Rank", "Product", "Founder", "Description", "Upvotes", "Days since launch", "Maker comments", "Score", "Fit", "Outreach angle", "URL"];
    const rows = visible.map((p, i) => [i + 1, p.name, p.founder, p.oneLiner, p.upvotes, p.daysSinceLaunch, p.makerComments, p.score, p.fit, p.outreachAngle, p.url]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "outreach-list.csv";
    a.click();
  }

  const searchHits = hits.filter((h) => !isSelected(h.slug));
  const contactedList = Object.values(contacted).sort((a, b) => b.contactedAt.localeCompare(a.contactedAt));

  /* ---------------------------------- landing ---------------------------------- */
  if (stage === "landing") {
    return (
      <div ref={landingRef} className="landing">
        <div ref={bgRef} className={`bg${loading ? " loading" : ""}`} aria-hidden="true" />
        <div className="veil" aria-hidden="true" />
        <div className="petals" aria-hidden="true">
          {PETALS.map((p) => (
            <span key={p.id} className="petal">
              <Petal size={p.size} color={p.color} />
            </span>
          ))}
        </div>

        <nav className="topnav">
          <span className="brand"><Bloom size={20} /> Partnership Scout</span>
          {contactedList.length > 0 && (
            <button className="link-btn" onClick={() => goResults("contacted")}>Contacted ({contactedList.length})</button>
          )}
        </nav>

        <section className="hero">
          <p className="eyebrow hero-in">Product Hunt, first week</p>
          <h1 className="hero-in">
            Meet your next partner <em>while the launch is still warm.</em>
          </h1>
          <p className="lede hero-in">
            New launches from the last 7 days, checked for fit, ranked by traction and by how quickly the makers reply, each with an outreach angle.
          </p>

          <div className="form-card">
            <div className="fields">
              <div>
                <label htmlFor="pname">Your company</label>
                <input id="pname" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </div>
              <div>
                <label htmlFor="pdesc">What you do and who you want to partner with</label>
                <textarea id="pdesc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} />
              </div>
            </div>

            <label>
              Categories <span className="muted">({selected.length}/{MAX_TOPICS} selected)</span>
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
                      {h.label} <span className="muted">{h.slug}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {capNote && <p className="muted" role="status">You can pick up to {MAX_TOPICS} categories. Remove one to add another.</p>}
            {error && <div className="banner err" role="alert">{error}</div>}

            <div className="cta">
              <MeadowButton onClick={run} disabled={loading || selected.length === 0} active={loading}>
                {loading ? "Scouting launches…" : "Generate outreach list"}
              </MeadowButton>
            </div>
          </div>
        </section>
      </div>
    );
  }

  /* ---------------------------------- results ---------------------------------- */
  return (
    <div ref={resultsRef} className="results">
      <div className="strip" aria-hidden="true" />
      <div className="wrap">
        <nav className="topnav dark">
          <span className="brand"><Bloom size={20} /> Partnership Scout</span>
          <button className="btn" onClick={() => setStage("landing")}>New search</button>
        </nav>

        <header className="res-head">
          <h2 className="res-in">Your outreach list</h2>
          {data && (
            <p className="muted res-in">
              Showing {shownList.length} of {visible.length} ranked launches
              {hiddenContacted > 0 && ` (${hiddenContacted} contacted hidden)`} · {data.source === "live" ? "live Product Hunt data" : "saved snapshot"} · generated{" "}
              {new Date(data.generatedAt).toLocaleString()}
            </p>
          )}
        </header>

        <div className="tabs res-in" role="tablist">
          <button role="tab" aria-selected={view === "list"} className="tab" onClick={() => setView("list")}>Outreach list</button>
          <button role="tab" aria-selected={view === "contacted"} className="tab" onClick={() => setView("contacted")}>Contacted ({contactedList.length})</button>
          {view === "list" && visible.length > 0 && <button className="btn download" onClick={downloadCsv}>Download CSV</button>}
        </div>

        {view === "contacted" && (
          <section>
            {contactedList.length === 0 ? (
              <div className="empty">Nobody marked as contacted yet. Use &ldquo;Mark contacted&rdquo; on a launch and it will show up here, and stay out of your list.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Product</th><th>Founder</th><th>Upvotes</th><th>Contacted on</th><th /></tr>
                  </thead>
                  <tbody>
                    {contactedList.map((c) => (
                      <tr key={c.id}>
                        <td><a href={c.url} target="_blank" rel="noreferrer">{c.name}</a></td>
                        <td>
                          {c.founder}
                          <div className="muted">
                            {c.profileUrl && <a href={c.profileUrl} target="_blank" rel="noreferrer">PH profile</a>}
                            {c.profileUrl && c.xUrl && " · "}
                            {c.xUrl && <a href={c.xUrl} target="_blank" rel="noreferrer">X</a>}
                          </div>
                        </td>
                        <td>{c.upvotes}</td>
                        <td>{new Date(c.contactedAt).toLocaleDateString()}</td>
                        <td><button className="btn" onClick={() => undoContacted(c.id)}>Undo</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted small-note">Saved in this browser only, so it persists across refreshes and new searches.</p>
          </section>
        )}

        {view === "list" && !data && <div className="empty">Run a scan first. Go back to New search and generate your list.</div>}

        {view === "list" && data && (
          <section>
            {data.warnings.map((w, i) => (
              <div key={i} className="banner warn">{w}</div>
            ))}

            {visible.length === 0 ? (
              <div className="empty">
                {products.length > 0
                  ? "Everyone in this list is marked as contacted. Try different categories."
                  : "No launches found for these categories in the last 7 days. Try different or additional categories."}
              </div>
            ) : (
              <>
                <div className="list">
                  {shownList.map((p, idx) => (
                    <ProductCard
                      key={p.id}
                      p={p}
                      index={idx}
                      focused={focusedIdx === idx}
                      onFocus={() => setFocusedIdx(idx)}
                      draft={drafts[p.id]}
                      scoreOpen={!!openScores[p.id]}
                      onToggleScore={() => setOpenScores((s) => ({ ...s, [p.id]: !s[p.id] }))}
                      onDraft={() => makeDraft(p)}
                      onCopy={(text) => copy(p.id, text)}
                      onEditDraft={(text) => setDrafts((all) => ({ ...all, [p.id]: { ...all[p.id], message: text } }))}
                      onContacted={() => markContacted(p)}
                    />
                  ))}
                </div>
                {visible.length > shown && (
                  <div className="more">
                    <button className="btn" onClick={() => setShown((n) => n + SHOW_MORE_STEP)}>
                      Show {Math.min(SHOW_MORE_STEP, visible.length - shown)} more
                    </button>
                  </div>
                )}
              </>
            )}

            {lowVisible.length > 0 && (
              <div className="low">
                <button className="btn" onClick={() => setShowLow((v) => !v)} aria-expanded={showLow}>
                  {showLow ? "Hide" : "Show"} low-fit launches ({lowVisible.length})
                </button>
                {showLow && (
                  <>
                    <p className="muted small-note">
                      Gemini judged these a poor fit for your product (a different customer, or a direct competitor), so they are kept out of the ranking. They are listed here in case it got one wrong.
                    </p>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>Product</th><th>Founder</th><th>Upvotes</th><th>Launched</th><th>Why it was set aside</th><th /></tr>
                        </thead>
                        <tbody>
                          {lowVisible.map((p) => (
                            <tr key={p.id}>
                              <td>
                                <a href={p.url} target="_blank" rel="noreferrer">{p.name}</a>
                                <div className="muted">{p.tagline}</div>
                              </td>
                              <td>{p.founder}</td>
                              <td>{p.upvotes}</td>
                              <td>{p.daysSinceLaunch === 0 ? "today" : `${p.daysSinceLaunch}d ago`}</td>
                              <td>{p.fitReason || "Not a clear match for your product"}</td>
                              <td><button className="btn" onClick={() => markContacted(p)}>Mark contacted</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        <details className="how">
          <summary>How the ranking works</summary>
          <p>
            Each launch gets a traction score out of 100: 55% upvotes, 30% maker responsiveness and 15% recency. Upvotes and maker points are log-scaled against the
            highest in the current list; recency falls from full points for a launch today to none at 7 days. Maker responsiveness is the number of comments written by the
            product&apos;s makers (latest 40 comments); short thank-you replies still count, at 0.3 of a full comment. A launch with no maker comments is never removed, it
            just earns 0 of the 30 maker points. Gemini also judges each launch as a good, maybe or poor fit for your product (same customer, not a competitor). Good fits keep
            their full score, maybe fits count 85%, and poor fits are set aside behind a toggle. Open any score to see its breakdown. Outreach angles quote the product&apos;s
            own text only when the quote can be found word for word in it; otherwise a plain angle is shown. Use the arrow keys or j and k to move between launches.
          </p>
        </details>
      </div>
    </div>
  );
}
