"use client";

import { gsap } from "gsap";
import { useEffect, useRef } from "react";
import { Sprout, type SproutKind } from "./Flowers";

// left offset (%), plant, height (px)
const SPROUTS: { left: number; kind: SproutKind; h: number }[] = [
  { left: 7, kind: "grass", h: 24 },
  { left: 20, kind: "daisy", h: 34 },
  { left: 33, kind: "grass", h: 28 },
  { left: 47, kind: "tulip", h: 38 },
  { left: 61, kind: "grass", h: 26 },
  { left: 74, kind: "bud", h: 32 },
  { left: 88, kind: "daisy", h: 28 },
];

/**
 * Primary button for the meadow look. On hover/focus the colour fades from sage to blush and a few tiny
 * flowers and grasses pop up above it. While `active` (loading) the plants stay up and sway.
 */
export function MeadowButton({
  children,
  onClick,
  disabled,
  active,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  type?: "button" | "submit";
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const open = useRef(false);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => {
      gsap.set(".sprout", { scale: 0, opacity: 0, transformOrigin: "50% 100%" });
    }, wrap);
    return () => ctx.revert();
  }, []);

  const grow = () => {
    if (open.current || disabled) return;
    open.current = true;
    const items = wrap.current?.querySelectorAll<HTMLElement>(".sprout");
    if (!items) return;
    gsap.killTweensOf(items);
    if (reduce.current) {
      gsap.set(items, { scale: 1, opacity: 1 });
      return;
    }
    gsap.to(items, { scale: 1, opacity: 1, duration: 0.55, ease: "back.out(2.4)", stagger: { each: 0.045, from: "center" } });
    items.forEach((el, i) => {
      gsap.to(el, { rotation: i % 2 ? 4 : -4, duration: 1.3 + (i % 3) * 0.25, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 0.6 });
    });
  };

  const shrink = () => {
    if (!open.current) return;
    open.current = false;
    const items = wrap.current?.querySelectorAll<HTMLElement>(".sprout");
    if (!items) return;
    gsap.killTweensOf(items);
    if (reduce.current) {
      gsap.set(items, { scale: 0, opacity: 0 });
      return;
    }
    gsap.to(items, { scale: 0, opacity: 0, rotation: 0, duration: 0.25, ease: "power2.in", stagger: { each: 0.02, from: "edges" } });
  };

  // keep the plants up while loading
  useEffect(() => {
    if (active) grow();
    else shrink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div
      ref={wrap}
      className="mb-wrap"
      onMouseEnter={grow}
      onMouseLeave={() => !active && shrink()}
      onFocus={grow}
      onBlur={() => !active && shrink()}
    >
      <div className="mb-sprouts" aria-hidden="true">
        {SPROUTS.map((s, i) => (
          <span key={i} className="sprout" style={{ left: `${s.left}%` }}>
            <Sprout kind={s.kind} height={s.h} />
          </span>
        ))}
      </div>
      <button type={type} className="mb-btn" onClick={onClick} disabled={disabled}>
        <span className="mb-fade" aria-hidden="true" />
        <span className="mb-label">{children}</span>
      </button>
    </div>
  );
}
