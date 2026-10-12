// Small hand-drawn-style flowers and grasses used across the UI (all inline SVG, decorative).

const PETAL = "#f0a898";
const PETAL_DEEP = "#d9786a";
const GOLD = "#e7c273";
const LEAF = "#7d9c74";
const STEM = "#5d7b58";

export function Bloom({ size = 18, petal = PETAL, center = GOLD }: { size?: number; petal?: string; center?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <ellipse key={a} cx="12" cy="6.2" rx="2.7" ry="4.7" fill={petal} transform={`rotate(${a} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="3.3" fill={center} />
    </svg>
  );
}

export function Bud({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22V11" stroke={STEM} strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <path d="M12 17c-3.4 0-5.4-1.7-5.8-4.4 3-.2 5.2 1 5.8 4.4z" fill={LEAF} />
      <path d="M12 12.5c-2.8-.7-3.8-3.2-3-6.6 2.4.9 3.4 3.4 3 6.6zM12 12.5c2.8-.7 3.8-3.2 3-6.6-2.4.9-3.4 3.4-3 6.6z" fill={PETAL} />
      <path d="M12 12.5c-1.4-1.6-1.4-4.4 0-7 1.4 2.6 1.4 5.4 0 7z" fill={PETAL_DEEP} />
    </svg>
  );
}

export type SproutKind = "grass" | "daisy" | "tulip" | "bud";

/** A small plant that grows from a baseline: viewBox 24x44, stem ends at the bottom edge. */
export function Sprout({ kind, height = 34 }: { kind: SproutKind; height?: number }) {
  const w = (height * 24) / 44;
  return (
    <svg width={w} height={height} viewBox="0 0 24 44" aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      {kind === "grass" && (
        <g fill="none" stroke={STEM} strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 44C12 32 11 22 7 12" />
          <path d="M12 44C12 30 13 20 18 8" />
          <path d="M12 44C11 36 8 30 3 26" stroke={LEAF} />
          <path d="M12 44C13 36 16 31 21 28" stroke={LEAF} />
        </g>
      )}
      {kind === "daisy" && (
        <g>
          <path d="M12 44V19" stroke={STEM} strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M12 35c-4 0-6.5-2-7-5 3.6-.2 6.4 1.2 7 5z" fill={LEAF} />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <ellipse key={a} cx="12" cy="9.5" rx="2.8" ry="5.4" fill="#fff" stroke={PETAL} strokeWidth="1" transform={`rotate(${a} 12 17)`} />
          ))}
          <circle cx="12" cy="17" r="3.4" fill={GOLD} />
        </g>
      )}
      {kind === "tulip" && (
        <g>
          <path d="M12 44V22" stroke={STEM} strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M12 40c-5 0-8-3-8.5-7 4.5-.2 8 1.6 8.5 7z" fill={LEAF} />
          <path d="M12 40c4-.4 6.5-2.6 7.5-5.6-3.6-.4-6.7 1.2-7.5 5.6z" fill={LEAF} />
          <path d="M6 12c0 7 2.6 11 6 11s6-4 6-11l-3 3-3-6-3 6z" fill={PETAL_DEEP} />
          <path d="M9 14l3-5 3 5c-.4 3.6-1.6 6-3 7-1.4-1-2.6-3.4-3-7z" fill={PETAL} />
        </g>
      )}
      {kind === "bud" && (
        <g>
          <path d="M12 44V20" stroke={STEM} strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M12 36c-4 0-6.5-2-7-5 3.6-.2 6.4 1.2 7 5z" fill={LEAF} />
          <path d="M12 21c-3.4-.9-4.6-4.2-3.6-8.6 3 1.2 4.2 4.4 3.6 8.6zM12 21c3.4-.9 4.6-4.2 3.6-8.6-3 1.2-4.2 4.4-3.6 8.6z" fill={PETAL} />
          <path d="M12 21c-1.8-2-1.8-5.6 0-9 1.8 3.4 1.8 7 0 9z" fill={PETAL_DEEP} />
        </g>
      )}
    </svg>
  );
}

export function Petal({ size = 14, color = PETAL }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 14 18" aria-hidden="true">
      <path d="M7 0C12 4 14 9 7 18 0 9 2 4 7 0z" fill={color} />
    </svg>
  );
}
