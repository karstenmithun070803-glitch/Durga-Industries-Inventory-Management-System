import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Mobile "record card" primitives — the shared building block for every mobile
// monitoring view (dashboard, stock, lists, reports). Desktop screens keep their
// existing tables (wrapped `hidden lg:block`); these render only in the `lg:hidden`
// mobile branch. Build the card content once per screen and reuse this shell.

/** Vertical list container for a set of cards. */
function RecordCardList({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

interface RecordCardProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** Optional link — renders the whole card as a tappable row with a chevron. */
  href?: string;
  /** Optional click handler — renders as a button-like tappable card with a chevron. */
  onCardClick?: () => void;
  /** Primary title (top-left). */
  title?: React.ReactNode;
  /** Secondary text under the title. */
  subtitle?: React.ReactNode;
  /** Trailing top-right slot (e.g. a status badge or amount). */
  trailing?: React.ReactNode;
}

/**
 * A single card. Header (title/subtitle + trailing) with optional field rows in children.
 * If `href`/`onCardClick` is set, the card is a 44px+ tap target with a chevron affordance.
 */
function RecordCard({
  href,
  onCardClick,
  title,
  subtitle,
  trailing,
  className,
  children,
  ...props
}: RecordCardProps) {
  const interactive = Boolean(href || onCardClick);

  const header = (title || subtitle || trailing) && (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {title && <div className="font-medium text-foreground truncate">{title}</div>}
        {subtitle && <div className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {trailing}
        {interactive && <ChevronRight className="size-4 text-muted-foreground" />}
      </div>
    </div>
  );

  const inner = (
    <>
      {header}
      {children && <div className="mt-2 flex flex-col gap-1">{children}</div>}
    </>
  );

  const base = cn(
    // shrink-0: keep full content height inside height-constrained flex-column scroll
    // containers (e.g. the stock list) instead of being squished to min-height.
    "block w-full shrink-0 rounded-lg border border-border bg-card p-3 text-left text-sm shadow-sm",
    interactive && "transition-colors active:bg-muted/60",
    className
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {inner}
      </Link>
    );
  }
  if (onCardClick) {
    // A div (not a native <button>) so multi-row card content lays out and sizes
    // correctly — Chromium won't grow a <button> to fit block/flex children.
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onCardClick();
          }
        }}
        className={cn(base, "min-h-11 cursor-pointer")}
      >
        {inner}
      </div>
    );
  }
  return (
    <div className={base} {...props}>
      {inner}
    </div>
  );
}

interface RecordFieldProps {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
  /** Emphasize the value (e.g. amounts). */
  strong?: boolean;
}

/** A label/value row inside a card. */
function RecordField({ label, value, className, strong }: RecordFieldProps) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-right tabular-nums", strong ? "font-semibold text-foreground" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

export { RecordCardList, RecordCard, RecordField };
