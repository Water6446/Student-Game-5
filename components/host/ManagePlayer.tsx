"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerRow, SessionRow } from "@/lib/game/db";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { Pencil } from "@/components/icons";
import { useToast } from "@/components/Toast";

/**
 * The host's answer to a bad name on the projector: rename the player, or take
 * them off the roster (host_rename_player / host_remove_player, 0028).
 *
 * Removing deletes the player and their allocations, and the same browser
 * cannot rejoin with the code. It is refused once the game has finished, so a
 * class's final results cannot change after the fact; renaming still works.
 * Benchmark bots get no button — the show-bots toggle is how they are hidden.
 */
export function ManagePlayerButton({
  supabase,
  session,
  player,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  player: PlayerRow;
}) {
  const [open, setOpen] = useState(false);
  if (player.is_bot) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Rename or remove ${player.display_name}`}
        title="Rename or remove"
        className="shrink-0 rounded-md p-1 text-ink-subtle transition hover:bg-paper-2 hover:text-ink"
      >
        <Pencil />
      </button>
      {/* Portalled: the rows this sits in animate with transforms, and a
          transformed ancestor would pin a fixed overlay inside the row. */}
      {open
        ? createPortal(
            <ManagePlayerDialog
              supabase={supabase}
              session={session}
              player={player}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function ManagePlayerDialog({
  supabase,
  session,
  player,
  onClose,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  player: PlayerRow;
  onClose: () => void;
}) {
  const toast = useToast();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(player.display_name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRemove = session.status !== "finished";

  // Same contract as ConfirmDialog: focus in, no page scroll behind, focus
  // back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const input = panelRef.current?.querySelector<HTMLInputElement>("input");
    input?.focus();
    input?.select();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>("button, input");
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function rename() {
    const next = name.trim();
    if (!next || next === player.display_name) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("host_rename_player", {
      p_player_id: player.id,
      p_display_name: next,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    toast("Name changed");
    onClose();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("host_remove_player", { p_player_id: player.id });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    toast(`${player.display_name} removed`);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md animate-pop-in rounded-2xl border-2 border-ink bg-surface p-6 text-left shadow-lift"
      >
        <h2 id={titleId} className="font-display text-xl font-black uppercase tracking-tight text-ink">
          Manage player
        </h2>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void rename();
          }}
          className="mt-4 space-y-3"
        >
          <Field label="Name" hint="Up to 40 characters">
            <TextInput
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save name"}
            </Button>
          </div>
        </form>

        {canRemove ? (
          <div className="mt-6 border-t-2 border-loss/30 pt-4">
            {confirmRemove ? (
              <div className="space-y-3">
                <p className="text-sm text-ink-muted">
                  This deletes {player.display_name}&apos;s rounds too, and they can&apos;t rejoin
                  this game with the code.
                </p>
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setConfirmRemove(false)}
                    disabled={busy}
                  >
                    Keep them
                  </Button>
                  <Button type="button" variant="danger" onClick={remove} disabled={busy}>
                    Remove {player.display_name}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="text-sm font-semibold text-loss hover:underline"
              >
                Remove from this game…
              </button>
            )}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4">
            <Banner kind="error">{error}</Banner>
          </div>
        ) : null}
      </div>
    </div>
  );
}
