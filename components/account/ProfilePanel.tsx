"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow } from "@/lib/auth/account";
import { Banner, Button, Card, Field, InfoTip, TextInput } from "@/components/ui";
import { usernameError } from "@/lib/auth/validation";
import { useToast } from "@/components/Toast";

/**
 * Profile editing.
 *
 * display_name and institution go through a plain PostgREST update — those two
 * columns are the entire client update grant on profiles (0016), capped at 80
 * and 120 characters by the database (0030). username goes
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
  const toast = useToast();
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [institution, setInstitution] = useState(profile.institution ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameChanged = username.trim() !== profile.username;

  async function save() {
    setBusy(true);
    setError(null);

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
        institution: institution.trim().slice(0, 120) || null,
      })
      .eq("id", profile.id);

    setBusy(false);
    if (error) setError(error.message);
    else {
      toast("Profile saved");
      onSaved();
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl font-black uppercase tracking-tight text-ink">Profile</h2>
        <InfoTip label="About your profile">
          Your username is how you sign in. Your display name is what students see.
        </InfoTip>
      </div>

      <div className="mt-5 space-y-4">
        <Field label="Username" hint="3–24 characters: letters, numbers, underscore">
          <TextInput value={username} maxLength={24} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Display name">
          <TextInput
            value={displayName}
            maxLength={80}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <Field label="Institution" hint="Optional">
          <TextInput
            value={institution}
            maxLength={120}
            onChange={(e) => setInstitution(e.target.value)}
          />
        </Field>

        {error ? <Banner kind="error">{error}</Banner> : null}

        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}
