"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rows of one table matching `column = value`, kept live: an initial select,
 * then a `postgres_changes` subscription on the same filter. RLS decides what
 * the caller sees, both in the select and in the realtime feed.
 *
 * `upsert` merges a row the caller already has (an RPC's return value) so the
 * screen does not wait for the realtime echo. Pass `value: null` to load
 * nothing (e.g. before the player's id is known).
 */
export function useLiveRows<T extends object>(
  supabase: SupabaseClient,
  opts: {
    table: string;
    columns?: string;
    column: string;
    value: string | null;
    /** a row's identity, for merging updates */
    keyOf: (row: T) => string;
    /** no realtime: a table outside the supabase_realtime publication */
    staticRows?: boolean;
    /** bump to refetch (tables without realtime, after a reveal) */
    reloadKey?: unknown;
  },
): { rows: T[]; loading: boolean; upsert: (row: T) => void } {
  const { table, columns = "*", column, value, staticRows, reloadKey } = opts;
  const keyOf = useRef(opts.keyOf);
  keyOf.current = opts.keyOf;
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const upsert = useCallback((row: T) => {
    setRows((prev) => {
      const k = keyOf.current(row);
      const i = prev.findIndex((r) => keyOf.current(r) === k);
      if (i < 0) return [...prev, row];
      const next = prev.slice();
      next[i] = { ...prev[i], ...row };
      return next;
    });
  }, []);

  useEffect(() => {
    if (!value) {
      setRows([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);

    supabase
      .from(table)
      .select(columns)
      .eq(column, value)
      .then(({ data }) => {
        if (!active) return;
        setRows(((data ?? []) as unknown) as T[]);
        setLoading(false);
      });

    if (staticRows) {
      return () => {
        active = false;
      };
    }

    const channel = supabase
      .channel(`${table}:${column}:${value}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `${column}=eq.${value}` },
        (payload) => {
          if (!active) return;
          if (payload.eventType === "DELETE") {
            const old = payload.old as T;
            const k = keyOf.current(old);
            setRows((prev) => prev.filter((r) => keyOf.current(r) !== k));
            return;
          }
          upsert(payload.new as T);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, table, columns, column, value, staticRows, reloadKey, upsert]);

  return { rows, loading, upsert };
}
