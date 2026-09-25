"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionOverviewRow } from "@/lib/game/db";
import { configForRerun, createSession } from "@/lib/game/create-session";
import { clsx } from "@/components/clsx";
import { LEDGER } from "@/components/ledger";
import { Banner, Button, Skeleton, TextInput } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { Pencil, Search, Shuffle, Trash, Users } from "@/components/icons";
import {
  filterSessions,
  gameLabel,
  sessionTitle,
  whenText,
  type SessionStatusFilter,
} from "@/lib/game/session-format";

// A status is text with a dot, not a pill (DESIGN.md §8 "Deltas are text").
const STATUS_STYLES: Record<string, { text: string; dot: string }> = {
  lobby: { text: "text-ink", dot: "bg-brand" },
  active: { text: "text-gain", dot: "bg-gain animate-pulse-soft" },
  finished: { text: "text-ink-subtle", dot: "bg-ink-subtle" },
};

/** Search and filters only earn their space once the list is long enough to need them. */
const TOOLBAR_FROM = 5;
/** Rows shown before "Show more" — a term of weekly sections is well past this. */
const PAGE = 20;

const FILTERS: { id: SessionStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "finished", label: "Finished" },
];

/**
 * The list a host comes back to. Each row has to answer "which class was that?"
 * without opening it, so it carries the name, roster size and round progress —
 * not just a join code and a timestamp. The name can be changed afterwards
 * (set_session_label, 0025), because it is usually typed in a hurry, if at all.
 */
export function SessionsList({
  rows,
  loading,
  onChanged,
  supabase,
}: {
  rows: SessionOverviewRow[];
  loading: boolean;
  onChanged: () => void;
  supabase: SupabaseClient;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SessionStatusFilter>("all");
  const [limit, setLimit] = useState(PAGE);

  const visible = useMemo(() => filterSessions(rows, query, status), [rows, query, status]);

  async function remove(s: SessionOverviewRow) {
    setBusyId(s.id);
    setError(null);
    const { error } = await supabase.rpc("delete_session", { p_session_id: s.id });
    setBusyId(null);
    setPendingDelete(null);
    if (error) setError(error.message);
    else {
      toast(`Deleted ${sessionTitle(s)}`);
      onChanged();
    }
  }

  async function rename(s: SessionOverviewRow) {
    setBusyId(s.id);
    setError(null);
    const { error } = await supabase.rpc("set_session_label", {
      p_session_id: s.id,
      p_label: draft.trim(),
    });
    setBusyId(null);
    if (error) {
      setError(
        // The migration may not be on the database yet.
        error.message.includes("set_session_label")
          ? "Renaming isn't available yet — the database needs migration 0025."
          : error.message,
      );
      return;
    }
    setRenaming(null);
    toast(draft.trim() ? `Renamed to ${draft.trim()}` : "Name cleared");
    onChanged();
  }

  async function runAgain(s: SessionOverviewRow) {
    setBusyId(s.id);
    setError(null);
    // configForRerun strips the manager line-up: the stored copy is public-only,
    // so resubmitting it would build a game with no real alpha. See its comment.
    const result = await createSession(supabase, configForRerun(s.config));
    if (!result.ok) {
      setError(result.error);
      setBusyId(null);
      return;
    }
    if (result.warning) setError(result.warning);
    router.push(`/host/${result.id}`);
  }

  if (loading) {
    return (
      <div role="status" className="space-y-2">
        <span className="sr-only">Loading your sessions…</span>
        <Skeleton className="h-[76px] w-full" />
        <Skeleton className="h-[76px] w-full" />
        <Skeleton className="h-[76px] w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="border-y-[1.5px] border-ink/15 px-6 py-10 text-center">
        <p className="font-display text-base font-extrabold uppercase tracking-tight text-ink">
          No sessions yet
        </p>
        <p className="mx-auto mt-2 max-w-sm font-editorial text-sm italic text-ink-muted">
          Pick a game above and you will get a join code to put on the projector. Everything you run
          stays here afterwards.
        </p>
      </div>
    );
  }

  return (
    <>
      {rows.length >= TOOLBAR_FROM ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex min-w-0 flex-1 items-center">
            <span className="sr-only">Search sessions</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 text-ink-muted" />
            <TextInput
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Search by name, code or game"
              className="py-2.5 pl-10"
            />
          </label>
          {/* One joined control, not three pills: active = solid ink fill +
              cream text (DESIGN.md §8). */}
          <div
            role="group"
            aria-label="Filter by status"
            className="flex shrink-0 divide-x-2 divide-ink overflow-hidden rounded-lg border-2 border-ink"
          >
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={status === f.id}
                onClick={() => {
                  setStatus(f.id);
                  setLimit(PAGE);
                }}
                className={clsx(
                  "min-h-[44px] px-4 font-display text-sm font-extrabold transition",
                  status === f.id
                    ? "bg-ink text-paper-inverse"
                    : "bg-surface text-ink hover:bg-paper-2",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-ink/30 px-6 py-8 text-center font-editorial text-sm italic text-ink-muted">
          No sessions match.
        </p>
      ) : (
        <ul className={LEDGER}>
          {visible.slice(0, limit).map((s) => {
            const confirming = pendingDelete === s.id;
            const editing = renaming === s.id;
            const busy = busyId === s.id;
            const rounds = s.config.num_rounds ?? 0;

            return (
              <li
                key={s.id}
                className="transition-colors hover:bg-brand-soft/60"
              >
                <div className="flex flex-wrap items-center gap-3 px-2 py-3">
                  {editing ? (
                    <form
                      noValidate
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!busy) void rename(s);
                      }}
                      className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                    >
                      <TextInput
                        autoFocus
                        value={draft}
                        maxLength={80}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        aria-label="Session name"
                        placeholder={`${gameLabel(s.config)} game`}
                        className="min-w-0 flex-1 py-2"
                      />
                      <Button type="submit" disabled={busy}>
                        {busy ? "Saving…" : "Save"}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setRenaming(null)}>
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <Link href={`/host/${s.id}`} className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="truncate font-display text-base font-extrabold text-ink">
                          {sessionTitle(s)}
                        </span>
                        <span
                          className={clsx(
                            "inline-flex items-center gap-1.5 font-display text-[11px] font-extrabold uppercase tracking-[0.12em]",
                            STATUS_STYLES[s.status]?.text,
                          )}
                        >
                          <span aria-hidden="true" className={clsx("h-2 w-2 rounded-full", STATUS_STYLES[s.status]?.dot)} />
                          {s.status}
                        </span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-xs text-ink-subtle">
                        <span className="font-bold tracking-widest text-ink-muted">{s.join_code}</span>
                        <span>{gameLabel(s.config)}</span>
                        <span className="inline-flex items-center gap-1">
                          <Users /> {s.player_count}
                        </span>
                        {rounds > 0 ? (
                          <span>
                            {Math.min(s.current_round, rounds)}/{rounds} rounds
                          </span>
                        ) : null}
                        <span>{whenText(s.created_at)}</span>
                      </span>
                    </Link>
                  )}

                  {editing ? null : confirming ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <Button variant="danger" onClick={() => remove(s)} disabled={busy}>
                        {busy ? "Deleting…" : "Delete for good"}
                      </Button>
                      <Button variant="secondary" onClick={() => setPendingDelete(null)}>
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setPendingDelete(null);
                          setDraft(s.config.label?.trim() ?? "");
                          setRenaming(s.id);
                        }}
                        disabled={busy}
                        aria-label={`Rename ${sessionTitle(s)}`}
                        title="Rename"
                        className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-ink-muted transition hover:bg-paper-2 hover:text-ink disabled:opacity-50"
                      >
                        <Pencil />
                      </button>
                      <button
                        type="button"
                        onClick={() => runAgain(s)}
                        disabled={busy}
                        title="Create a new session with these settings"
                        aria-label={busy ? "Starting…" : `Run ${sessionTitle(s)} again`}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-ink-muted transition hover:bg-paper-2 hover:text-ink disabled:opacity-50"
                      >
                        <Shuffle />
                        {/* icon-only on a phone, so the session's name has the room */}
                        <span className="hidden sm:inline">{busy ? "Starting…" : "Run again"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setRenaming(null);
                          setPendingDelete(s.id);
                        }}
                        aria-label={`Delete session ${sessionTitle(s)}`}
                        title="Delete session"
                        className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-loss transition hover:bg-loss-soft"
                      >
                        <Trash />
                      </button>
                    </span>
                  )}
                </div>

                {confirming ? (
                  <p className="border-t-2 border-ink px-4 py-2 text-xs font-semibold text-loss">
                    This permanently removes its students, rounds and allocations. It cannot be undone.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {visible.length > limit ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => setLimit((n) => n + PAGE)}>
            Show {Math.min(PAGE, visible.length - limit)} more
          </Button>
        </div>
      ) : null}
    </>
  );
}
