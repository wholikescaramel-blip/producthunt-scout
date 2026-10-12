"use client";

import { gsap } from "gsap";
import { useEffect, useRef } from "react";
import { WEIGHT_MAKER, WEIGHT_RECENCY, WEIGHT_UPVOTES } from "@/lib/config";
import type { ScoredProduct } from "@/lib/types";
import { Bloom, Bud } from "./Flowers";

export type Draft = { loading: boolean; message?: string; source?: "gemini" | "template"; error?: string; copied?: boolean };

const pct = (w: number) => Math.round(w * 100);

export function FitTag({ p }: { p: ScoredProduct }) {
  const label = p.fit === "good" ? "Good fit" : p.fitRated ? "Maybe fit" : "Fit not rated";
  return (
    <span className={`fit fit-${p.fit}`} title={p.fitReason || undefined}>
      {p.fit === "good" ? <Bloom size={15} /> : <Bud size={15} />}
      {label}
    </span>
  );
}

/** One launch. Scales into view the first time it scrolls on screen (like a sprout growing). */
export function ProductCard({
  p,
  index,
  focused,
  onFocus,
  draft,
  scoreOpen,
  onToggleScore,
  onDraft,
  onCopy,
  onEditDraft,
  onContacted,
}: {
  p: ScoredProduct;
  index: number;
  focused: boolean;
  onFocus: () => void;
  draft?: Draft;
  scoreOpen: boolean;
  onToggleScore: () => void;
  onDraft: () => void;
  onCopy: (text: string) => void;
  onEditDraft: (text: string) => void;
  onContacted: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const b = p.breakdown;
  const c = p.contact;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.set(el, { opacity: 0, scale: 0.94, y: 26 });
    let shown = false;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (shown || !entries[0].isIntersecting) return;
        shown = true;
        gsap.to(el, { opacity: 1, scale: 1, y: 0, duration: 0.55, ease: "power3.out", clearProps: "transform" });
        // safety net if the tween is stalled (throttled tab): never leave a card invisible
        fallback = setTimeout(() => gsap.set(el, { opacity: 1, scale: 1, y: 0, clearProps: "transform" }), 1500);
        io.disconnect();
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (fallback) clearTimeout(fallback);
    };
  }, []);

  return (
    <article ref={ref} className={`card${focused ? " focused" : ""}`} data-index={index} onMouseEnter={onFocus}>
      <div className="card-rank" aria-label={`Rank ${index + 1}`}>{index + 1}</div>

      <div className="card-main">
        <div className="card-head">
          <h3>
            <a href={p.url} target="_blank" rel="noreferrer">{p.name}</a>
          </h3>
          <FitTag p={p} />
        </div>
        <p className="card-liner">{p.oneLiner}</p>
        <div className="stats">
          <span><b>{p.upvotes}</b> upvotes</span>
          <span>{p.daysSinceLaunch === 0 ? "launched today" : `launched ${p.daysSinceLaunch}d ago`}</span>
          <span><b>{p.makerComments}</b> maker comment{p.makerComments === 1 ? "" : "s"}</span>
          <span>{p.founder}</span>
        </div>
        {p.fitReason && <p className="card-reason">{p.fitReason}</p>}

        <div className="angle">
          {p.angleSource === "pending" ? (
            <span className="muted">Writing angle…</span>
          ) : (
            <>
              <p>{p.outreachAngle}</p>
              {p.evidence && (
                <blockquote className="evidence">
                  &ldquo;{p.evidence.quote}&rdquo; <span className="muted">from their {p.evidence.from}</span>
                </blockquote>
              )}
              <span className="src">{p.angleSource === "gemini" ? "Written by Gemini" : "Template angle"}</span>
            </>
          )}
        </div>

        <div className="card-actions">
          <button className="btn" onClick={onDraft} disabled={draft?.loading || p.angleSource === "pending"}>
            {draft?.loading ? "Drafting…" : draft?.message ? "Hide draft" : "Draft message"}
          </button>
          <button className="btn" onClick={onContacted}>Mark contacted</button>
        </div>
      </div>

      <button className="score" aria-expanded={scoreOpen} title="See how this score is made" onClick={onToggleScore}>
        <strong>{p.score}</strong>
        <small>score</small>
      </button>

      {scoreOpen && (
        <div className="card-panel breakdown">
          <div>
            <strong>Base score {p.baseScore}</strong> = upvotes <strong>{b.upvotePts}</strong> / {pct(WEIGHT_UPVOTES)} + maker responsiveness{" "}
            <strong>{b.makerPts}</strong> / {pct(WEIGHT_MAKER)} + recency <strong>{b.recencyPts}</strong> / {pct(WEIGHT_RECENCY)}
          </div>
          <div>
            Fit: <strong>{p.fit}</strong> (x{p.fitFactor}){!p.fitRated && " - Gemini could not rate it, so it counts as a maybe"}.{" "}
            <strong>Final score {p.score}</strong> = {p.baseScore} x {p.fitFactor}
          </div>
          <div className="muted">
            Upvotes: {p.upvotes}. Maker comments: {p.makerComments}
            {p.makerComments > 0 ? ` (${b.weightedComments} weighted; short thank-yous count 0.3)` : " (none found in the latest 40 comments, so 0 points)"}. Upvotes and maker
            points are scaled against the top launch in this list. Recency: launched {p.daysSinceLaunch === 0 ? "today" : `${p.daysSinceLaunch} day(s) ago`}, newer earns more.
          </div>
        </div>
      )}

      {draft && !draft.loading && (
        <div className="card-panel">
          {draft.error ? (
            <div className="banner err">{draft.error}</div>
          ) : (
            <>
              <textarea value={draft.message} onChange={(e) => onEditDraft(e.target.value)} aria-label={`Draft message to ${p.name}`} />
              <div className="draft-actions">
                <button className="btn primary" onClick={() => onCopy(draft.message ?? "")}>{draft.copied ? "Copied" : "Copy message"}</button>
                <a className="btn" href={c.productHuntUrl} target="_blank" rel="noreferrer">Open on Product Hunt</a>
                {c.makerProfileUrl && <a className="btn" href={c.makerProfileUrl} target="_blank" rel="noreferrer">Maker profile</a>}
                {c.makerTwitterUrl && <a className="btn" href={c.makerTwitterUrl} target="_blank" rel="noreferrer">X</a>}
                {(c.makerWebsiteUrl || c.productWebsite) && (
                  <a className="btn" href={c.makerWebsiteUrl || c.productWebsite} target="_blank" rel="noreferrer">Website</a>
                )}
              </div>
              <p className="muted small-note">
                {draft.source === "gemini" ? "Written by Gemini." : "Template draft."} Product Hunt doesn&apos;t share emails, so paste this wherever you reach them.
              </p>
            </>
          )}
        </div>
      )}
    </article>
  );
}
