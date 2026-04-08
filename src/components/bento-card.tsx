import type { ElementType, ReactNode, HTMLAttributes } from "react";

interface BentoCardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  gradient?: boolean;
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
}

const paddingMap: Record<NonNullable<BentoCardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export default function BentoCard({
  as,
  gradient = false,
  hover = false,
  padding = "md",
  className = "",
  children,
  ...rest
}: BentoCardProps) {
  const Tag = (as ?? "div") as ElementType;
  const base = "bento-card overflow-hidden";
  const hoverCls = hover ? "bento-card--hover cursor-pointer" : "";
  const gradientCls = gradient ? "brand-gradient-bg text-white border-transparent" : "";
  return (
    <Tag
      className={`${base} ${hoverCls} ${gradientCls} ${paddingMap[padding]} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
