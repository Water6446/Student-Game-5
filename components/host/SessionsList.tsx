"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";

const STATUS_STYLES: Record<string, string> = {
  lobby: "bg-amber-500/20 text-amber-300",
  active: "bg-emerald-500/20 text-emerald-300",
  finished: "bg-slate-600/30 text-slate-400",
};

export function SessionsList({ supabase, hostId }: { supabase: SupabaseClient; hostId: string }) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("sessions")
      .select("*")
      .eq("host_id", hostId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as SessionRow[]) ?? []));
  }, [supabase, hostId]);

  if (rows === null) return <p className="text-sm text-slate-500">Loading your sessions…</p>;
  if (rows.length === 0)
    return <p className="text-sm text-slate-500">No sessions yet — create one above.</p>;

  return (
    <ul className="divide-y divide-slate-800">
      {rows.map((s) => (
        <li key={s.id}>
          <Link
            href={`/host/${s.id}`}
            className="flex items-center justify-between gap-4 px-1 py-3 hover:bg-slate-800/40"
          >
            <div>
              <span className="font-mono text-lg tracking-widest">{s.join_code}</span>
              <span className="ml-3 text-sm text-slate-500">
                {new Date(s.created_at).toLocaleString()}
              </span>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[s.status] ?? ""}`}
            >
              {s.status}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
