import BentoCard from "./bento-card";
import type { ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: ReactNode;
  trend?: string;
  accent?: "gradient" | "plain";
  icon?: ReactNode;
  className?: string;
}

export default function StatTile({
  label,
  value,
  trend,
  accent = "plain",
  icon,
  className = "",
}: StatTileProps) {
  const isGradient = accent === "gradient";
  return (
    <BentoCard
      padding="md"
      hover
      gradient={isGradient}
      className={`flex flex-col justify-between min-h-[140px] ${className}`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`text-[10px] uppercase tracking-[0.18em] font-semibold ${
            isGradient ? "text-white/80" : "text-slate-500"
          }`}
        >
          {label}
        </span>
        {icon ? (
          <span
            className={`shrink-0 ${isGradient ? "text-white/90" : "text-slate-400"}`}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div>
        <div
          className={`font-display text-5xl leading-none tracking-tight tabular-nums ${
            isGradient ? "text-white" : "text-slate-900"
          }`}
        >
          {value}
        </div>
        {trend ? (
          <div
            className={`mt-2 text-xs ${
              isGradient ? "text-white/80" : "text-slate-500"
            }`}
          >
            {trend}
          </div>
        ) : null}
      </div>
    </BentoCard>
  );
}
