"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeletionPreview } from "@/lib/auth/account";
import { Banner, Button, Card, Field, InfoTip, TextInput } from "@/components/ui";
import { Download, Trash } from "@/components/icons";
import { useToast } from "@/components/Toast";

const CONFIRM_WORD = "DELETE";

/**
 * Export and delete — the two things a privacy policy has to be able to promise
 * (docs/ACCOUNTS.md §6.6).
 *
 * Deleting is loud on purpose. sessions.host_id cascades, so removing a host
 * also removes the sessions they ran and every student's rows inside them; the
 * preview says exactly how many before anything is typed.
 */
export function DangerZone({ supabase }: { supabase: SupabaseClient }) {
  const toast = useToast();
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.rpc("my_deletion_preview").then(({ data }) => {
      if (!active) return;
      const row = Array.isArray(data) ? data[0] : data;
      setPreview((row as DeletionPreview) ?? null);
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  async function exportData() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("export_my_data");
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "investment-game-my-data.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Your data is downloading");
  }

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    await supabase.auth.signOut();
    window.location.assign("/");
  }

  const blocked = (preview?.live_sessions_hosted ?? 0) > 0;

  return (
    <Card>
      <h2 className="font-display text-xl font-black uppercase tracking-tight text-ink">
        Your data
      </h2>

      <div className="mt-5 flex items-center gap-2">
        <Button variant="secondary" onClick={exportData} disabled={busy}>
          <Download />
          Download everything
        </Button>
        <InfoTip label="About the data download">
          A JSON file with your profile, the sessions you hosted, and every round you played.
        </InfoTip>
      </div>

      <div className="mt-6 border-t-2 border-loss/30 pt-5">
        <h3 className="font-display text-sm font-extrabold uppercase tracking-wide text-loss">
          Delete account
        </h3>

        {preview ? (
          <p className="mt-2 text-sm text-ink-muted">
            This permanently removes your account
            {preview.sessions_hosted > 0 ? (
              <>
                {" "}
                and the{" "}
                <span className="font-bold text-ink">{preview.sessions_hosted}</span> session
                {preview.sessions_hosted === 1 ? "" : "s"} you hosted — including every student
                result inside them
              </>
            ) : null}
            .
            {preview.sessions_played > 0 ? (
              <>
                {" "}
                The{" "}
                <span className="font-bold text-ink">{preview.sessions_played}</span> session
                {preview.sessions_played === 1 ? "" : "s"} you played stay in their host&apos;s
                records, but are no longer linked to you.
              </>
            ) : null}
          </p>
        ) : null}

        {blocked ? (
          <div className="mt-4">
            <Banner kind="info">
              Finish or delete your {preview?.live_sessions_hosted} running session
              {preview?.live_sessions_hosted === 1 ? "" : "s"} first — a class in progress must not
              vanish under the students in it.
            </Banner>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <Field label={`Type ${CONFIRM_WORD} to confirm`}>
              <TextInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <Button
              variant="danger"
              onClick={deleteAccount}
              disabled={busy || confirm.trim() !== CONFIRM_WORD}
            >
              <Trash />
              {busy ? "Deleting…" : "Delete my account"}
            </Button>
          </div>
        )}

        {error ? (
          <div className="mt-3">
            <Banner kind="error">{error}</Banner>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
