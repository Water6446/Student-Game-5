"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";

const STATUS_STYLES: Record<string, string> = {
  lobby: "bg-brand-soft text-ink",
  active: "bg-gain-soft text-gain",
  finished: "bg-paper-2 text-ink-subtle",
};

export function SessionsList({ supabase, hostId }: { supabase: SupabaseClient; hostId: string }) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("sessions")
      .select("*")
      .eq("host_id", hostId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as SessionRow[]) ?? []));
  }, [supabase, hostId]);

  async function remove(s: SessionRow) {
    const ok = window.confirm(
      `Delete session ${s.join_code}? This permanently removes its players, rounds and allocations. This cannot be undone.`,
    );
    if (!ok) return;
    setDeletingId(s.id);
    setError(null);
    const { error } = await supabase.rpc("delete_session", { p_session_id: s.id });
    setDeletingId(null);
    if (error) {
      setError(error.message);
      return;
    }
    setRows((prev) => (prev ?? []).filter((r) => r.id !== s.id));
  }

  if (rows === null) return <p className="text-sm text-ink-subtle">Loading your sessions…</p>;
  if (rows.length === 0)
    return <p className="text-sm text-ink-subtle">No sessions yet — create one above.</p>;

  return (
    <>
      {error ? (
        <p className="mb-2 rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{error}</p>
      ) : null}
      <ul className="divide-y divide-line">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <Link
              href={`/host/${s.id}`}
              className="flex flex-1 items-center justify-between gap-4 rounded-lg px-2 py-3 transition hover:bg-paper-2"
            >
              <div>
                <span className="font-mono text-lg font-bold tracking-widest text-ink">
                  {s.join_code}
                </span>
                <span className="ml-3 text-sm text-ink-subtle">
                  {new Date(s.created_at).toLocaleString()}
                </span>
              </div>
              <span
                className={`rounded-full border-2 border-ink px-3 py-1 text-xs font-display font-extrabold capitalize shadow-card ${STATUS_STYLES[s.status] ?? ""}`}
              >
                {s.status}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => remove(s)}
              disabled={deletingId === s.id}
              aria-label={`Delete session ${s.join_code}`}
              title="Delete session"
              className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-loss transition hover:bg-loss-soft disabled:opacity-50"
            >
              {deletingId === s.id ? "Deleting…" : "Delete"}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
