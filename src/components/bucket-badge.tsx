"use client";

import { useState } from "react";
import type { Bucket, ScoreBreakdown } from "@/lib/types";

interface BucketBadgeProps {
  bucket: Bucket;
  total: number;
  breakdown?: ScoreBreakdown;
  size?: "sm" | "md" | "lg";
}

const ICON: Record<Bucket, string> = {
  HIGH: "🔥",
  MEDIUM: "⚡",
  LOW: "💤",
  DISCARD: "❌",
};

const LABEL: Record<Bucket, string> = {
  HIGH: "HIGH",
  MEDIUM: "MED",
  LOW: "LOW",
  DISCARD: "DISCARD",
};

function styleFor(bucket: Bucket): string {
  switch (bucket) {
    case "HIGH":
      return "brand-gradient-bg text-white border-transparent shadow-[0_4px_14px_-4px_rgba(219,39,119,0.5)]";
    case "MEDIUM":
      return "bg-amber-50 text-amber-700 border border-amber-200";
    case "LOW":
      return "bg-slate-100 text-slate-600 border border-slate-200";
    case "DISCARD":
      return "bg-red-50 text-red-700 border border-red-200";
  }
}

const SIZE = {
  sm: "text-[10px] px-2 py-0.5 gap-1",
  md: "text-xs px-2.5 py-1 gap-1.5",
  lg: "text-sm px-3 py-1.5 gap-2",
};

export default function BucketBadge({
  bucket,
  total,
  breakdown,
  size = "md",
}: BucketBadgeProps) {
  const [open, setOpen] = useState(false);
  const hasPopover = !!breakdown;

  const badge = (
    <span
      className={`inline-flex items-center rounded-full font-bold tracking-wide whitespace-nowrap ${styleFor(
        bucket
      )} ${SIZE[size]}`}
    >
      <span aria-hidden>{ICON[bucket]}</span>
      <span>{LABEL[bucket]}</span>
      <span className="font-mono opacity-80">{total}</span>
    </span>
  );

  if (!hasPopover) return badge;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {badge}
      {open && breakdown && (
        <div className="absolute z-40 top-full mt-2 left-0 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.25)] text-xs text-slate-700 font-sans">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
            <span className="font-semibold text-slate-900">Score breakdown</span>
            <span className="font-mono text-slate-900 font-bold">
              {total}/100
            </span>
          </div>
          <ul className="space-y-1.5">
            {[
              { label: "Financial", s: breakdown.financial.score, m: 30 },
              { label: "Condition", s: breakdown.condition.score, m: 25 },
              { label: "Timing", s: breakdown.timing.score, m: 20 },
              { label: "Owner", s: breakdown.owner.score, m: 15 },
              { label: "Contact", s: breakdown.contact.score, m: 10 },
            ].map((row) => {
              const pct = Math.max(0, Math.min(100, (row.s / row.m) * 100));
              return (
                <li key={row.label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-slate-500">{row.label}</span>
                    <span className="font-mono text-slate-700">
                      {row.s}/{row.m}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full brand-gradient-bg rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </span>
  );
}
