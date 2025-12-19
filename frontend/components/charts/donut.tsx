import React from "react";

type Segment = { value: number; color: string };
type Props = { segments: Segment[]; size?: number; thickness?: number };

export function Donut({ segments, size = 140, thickness = 16 }: Props) {
  const total = Math.max(1, segments.reduce((a, s) => a + (s.value || 0), 0));
  let current = 0;
  const stops: string[] = [];
  for (const s of segments) {
    const next = current + (s.value / total) * 100;
    stops.push(`${s.color} ${current}% ${next}%`);
    current = next;
  }
  const bg = `conic-gradient(${stops.join(", ")})`;
  const inner = size - thickness * 2;
  return (
    <div style={{ width: size, height: size }} className="relative">
      <div className="absolute inset-0 rounded-full" style={{ backgroundImage: bg }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full bg-card" style={{ width: inner, height: inner }} />
      </div>
    </div>
  );
}

