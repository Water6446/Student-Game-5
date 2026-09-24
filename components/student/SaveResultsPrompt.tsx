"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ClaimAccount } from "@/components/account/ClaimAccount";
import { Banner } from "@/components/ui";
import { X } from "@/components/icons";

/**
 * "Keep your results?" — offered once, at the end of a session, never before.
 *
 * Design constraints this deliberately honours (docs/ACCOUNTS.md §5.3): it never
 * blocks play, it appears only after the results the student came for, the
 * dismissal sticks, and it asks for the minimum — a username, and an email only
 * if they choose that route over Google.
 *
 * Rendered only for guests. A student who already has an account sees nothing.
 */

const DISMISS_KEY = "claim.dismissed";

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function remember() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* blocked storage: they will be asked again next time, which is the least
       bad failure mode */
  }
}

export function SaveResultsPrompt({
  supabase,
  user,
}: {
  supabase: SupabaseClient;
  user: User | null;
}) {
  // Starts hidden and is revealed after mount. Reading localStorage during
  // render would not match the server pass, and starting visible would flash the
  // prompt at someone who already said no.
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    setDismissed(isDismissed());
  }, []);

  if (!user || dismissed) return null;
  // Once they have started saving, stay put. Adding an email can convert the
  // guest on the spot, and hiding the moment is_anonymous flips would drop them
  // right before the step that picks their username and password.
  if (!user.is_anonymous && !open) return null;

  if (claimed) {
    return (
      <div className="mt-8 text-left">
        <Banner kind="success">
          Saved. Your sessions are on{" "}
          <Link href="/account" className="underline underline-offset-4">
            your account page
          </Link>
          .
        </Banner>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl border-2 border-ink bg-paper-2 p-5 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-extrabold uppercase tracking-tight text-ink">
            Keep your results?
          </h2>
          <p className="mt-1 font-editorial text-sm italic text-ink-muted">
            Save them to an account and your next sessions line up beside this one.
          </p>
        </div>
        <button
          type="button"
          aria-label="No thanks"
          onClick={() => {
            remember();
            setDismissed(true);
          }}
          className="shrink-0 rounded-lg border-2 border-transparent p-1 text-ink-subtle transition hover:border-ink hover:text-ink"
        >
          <X />
        </button>
      </div>

      {open ? (
        <div className="mt-4">
          <ClaimAccount
            supabase={supabase}
            user={user}
            next="/account"
            onClaimed={() => setClaimed(true)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 w-full rounded-xl border-2 border-ink bg-brand px-5 py-3 font-display font-extrabold text-ink shadow-card transition hover:bg-brand-strong active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          Save my results
        </button>
      )}
    </div>
  );
}
