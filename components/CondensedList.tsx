"use client";

import { Fragment, useMemo, useState } from "react";
import { condenseRanked, type CondenseOptions } from "@/lib/game/condense";
import { clsx } from "@/components/clsx";
import { ChevronDown } from "@/components/icons";

// The expander and "Show fewer" share one shape everywhere; callers only set
// type size and colour.
const TOGGLE_BASE =
  "inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 transition hover:bg-ink/[0.06]";

/**
 * Renders a long, ranked list as top-N + "+N more" + bottom-M, with a
 * "Show fewer" toggle. The single home for the collapse pattern used on every
 * surface that lists players (see lib/game/condense.ts for the pure split).
 *
 * `renderItem` returns the row element itself — an `<li>` with whatever classes
 * that surface needs — so each list keeps its own markup; this component only
 * owns the split, the gap rows and the toggle. Type sizes and wording differ per
 * surface (the projector shouts, the control panel whispers), which is what
 * gapClassName / toggleClassName / moreNoun are for. The split never differs.
 */
export function CondensedList<T>({
  items,
  keyOf,
  renderItem,
  keepIndices,
  options,
  as = "ol",
  className,
  gapClassName,
  gapItemClassName,
  toggleClassName,
  moreNoun,
}: {
  items: T[];
  keyOf: (item: T, index: number) => string;
  /** index is the position in the ORIGINAL array, so ranks never renumber */
  renderItem: (item: T, index: number) => React.ReactNode;
  keepIndices?: number[];
  options?: CondenseOptions;
  as?: "ol" | "ul";
  className?: string;
  /** styling hook so the projector can use bigger type than the control panel */
  gapClassName?: string;
  /** the gap row's own <li>, for a list whose rows carry their own rules */
  gapItemClassName?: string;
  toggleClassName?: string;
  /** appended to the expander label: "+92 more players". Omit for "+92 more". */
  moreNoun?: string;
}): JSX.Element {
  const [showAll, setShowAll] = useState(false);

  const collapsed = useMemo(
    () => condenseRanked(items, { ...options, keepIndices }),
    [items, options, keepIndices],
  );
  const expanded = useMemo(
    () => condenseRanked(items, { ...options, keepIndices, threshold: Infinity }),
    [items, options, keepIndices],
  );
  // Whether the list condenses at all — decides whether "Show fewer" is offered.
  const condensable = collapsed.some((c) => c.kind === "gap");
  const shown = showAll ? expanded : collapsed;

  const List = as;
  const noun = moreNoun ? ` ${moreNoun}` : "";

  return (
    <>
      <List className={className}>
        {shown.map((c, i) =>
          c.kind === "gap" ? (
            // Keyed per gap: keepIndices can produce more than one.
            // col-span-full matters when the list is a grid (the host's
            // submitted checklist); it is inert everywhere else.
            <li key={`gap-${i}`} className={clsx("col-span-full basis-full text-center", gapItemClassName)}>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                aria-expanded={false}
                aria-label={`Show ${c.hidden} more ${moreNoun ?? "players"}`}
                className={clsx(TOGGLE_BASE, gapClassName)}
              >
                +{c.hidden} more{noun} <ChevronDown />
              </button>
            </li>
          ) : (
            <Fragment key={keyOf(c.item, c.index)}>{renderItem(c.item, c.index)}</Fragment>
          ),
        )}
      </List>
      {showAll && condensable ? (
        <p className="text-center">
          <button
            type="button"
            onClick={() => setShowAll(false)}
            aria-expanded={true}
            className={clsx(TOGGLE_BASE, toggleClassName)}
          >
            Show fewer <ChevronDown className="rotate-180" />
          </button>
        </p>
      ) : null}
    </>
  );
}
