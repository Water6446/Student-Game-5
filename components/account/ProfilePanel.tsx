"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow } from "@/lib/auth/account";
import { Banner, Button, Card, Field, TextInput } from "@/components/ui";
import { usernameError } from "@/lib/auth/validation";

/**
 * Profile editing.
 *
 * display_name and institution go through a plain PostgREST update — those two
 * columns are the entire client update grant on profiles (0016). username goes
 * through set_my_username() instead, because format and uniqueness have to be
 * checked server-side; role and plan have no client write path at all.
 */
export function ProfilePanel({
  supabase,
  profile,
  onSaved,
}: {
  supabase: SupabaseClient;
  profile: ProfileRow;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [institution, setInstitution] = useState(profile.institution ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const usernameChanged = username.trim() !== profile.username;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);

    if (usernameChanged) {
      const uErr = usernameError(username);
      if (uErr) {
        setError(uErr);
        setBusy(false);
        return;
      }
      const { error } = await supabase.rpc("set_my_username", { p_username: username.trim() });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim().slice(0, 80),
        institution: institution.trim() || null,
      })
      .eq("id", profile.id);

    setBusy(false);
    if (error) setError(error.message);
    else {
      setSaved(true);
      onSaved();
    }
  }

  return (
    <Card>
      <h2 className="font-display text-xl font-black uppercase tracking-tight text-ink">Profile</h2>
      <p className="mt-1 font-editorial text-sm italic text-ink-muted">
        Your username is how you sign in. Your display name is what students see.
      </p>

      <div className="mt-5 space-y-4">
        <Field label="Username" hint="3–24 characters: letters, numbers, underscore">
          <TextInput value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Display name">
          <TextInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="Institution" hint="Optional">
          <TextInput
            placeholder="University of —"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
          />
        </Field>

        {error ? <Banner kind="error">{error}</Banner> : null}
        {saved ? <Banner kind="success">Saved.</Banner> : null}

        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}
