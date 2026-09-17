"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { useProfile } from "@/components/use-profile";
import { clsx } from "@/components/clsx";
import { ChevronDown, LogOut, Sliders, User as UserIcon } from "@/components/icons";

/**
 * The right-hand side of the site header: a log-in link when signed out, an
 * account dropdown when signed in.
 *
 * This is the only client island on the marketing page. The header and the page
 * around it stay server-rendered; only this piece hydrates, and it reserves its
 * own width so the bar does not jump when the session resolves.
 *
 * A guest (anonymous session from /join) is NOT treated as signed out: they have
 * results worth keeping, so the menu offers to turn the guest into an account
 * rather than pretending nobody is there.
 */
export function AccountMenu() {
  const { supabase, user, loading } = useSupabaseUser();
  const { profile } = useProfile(supabase, user?.id ?? null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a dropdown that can only be closed by
  // picking something from it is a trap, especially on a phone.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Hold the slot while the session resolves, so the header does not reflow.
  // Matches the rendered trigger's width at each breakpoint so the bar neither
  // reflows nor overflows while the session resolves.
  if (loading) {
    return <span aria-hidden className="inline-block h-[44px] w-[44px] sm:w-[88px]" />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-flex min-h-[44px] items-center text-sm font-semibold text-ink-muted transition hover:text-ink"
      >
        Log in
      </Link>
    );
  }

  const guest = Boolean(user.is_anonymous);
  const name = guest ? "Guest" : profile?.username ?? user.email ?? "Account";
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  // What the panel leads with. Falls back through display name -> username ->
  // email, which is also what `name` does when there is no profile row yet.
  const heading = profile?.display_name?.trim() || name;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={guest ? "Guest menu" : `Account menu for ${name}`}
        className={clsx(
          "inline-flex min-h-[44px] items-center gap-2 rounded-full border-2 border-ink transition",
          "px-1.5 sm:px-2 sm:pr-3",
          "font-display text-sm font-extrabold text-ink",
          open ? "bg-paper-2" : "bg-surface hover:bg-paper-2",
        )}
      >
        <span
          className={clsx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-black",
            guest ? "bg-ink text-paper" : "bg-brand text-ink",
          )}
        >
          {initial}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{name}</span>
        <ChevronDown className={clsx("hidden transition sm:block", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border-2 border-ink bg-surface shadow-card"
        >
          <div className="border-b-2 border-ink bg-paper-2 px-4 py-3">
            {guest ? (
              <>
                <p className="font-display text-sm font-extrabold text-ink">Playing as a guest</p>
                <p className="mt-0.5 font-editorial text-xs italic text-ink-muted">
                  Your results are not saved to an account yet.
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-sm font-extrabold text-ink">{heading}</p>
                {/* Only when it adds something. Before the profile loads, `name`
                    already falls back to the email, and printing it twice just
                    looks like a bug. */}
                {user.email && user.email !== heading ? (
                  <p className="mt-0.5 truncate font-mono text-xs text-ink-muted" title={user.email}>
                    {user.email}
                  </p>
                ) : null}
                {profile ? (
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                    @{profile.username} · {profile.plan} plan
                  </p>
                ) : null}
              </>
            )}
          </div>

          <ul className="p-1.5">
            {guest ? (
              <MenuLink href="/account" onGo={() => setOpen(false)} icon={<UserIcon />}>
                Create an account
              </MenuLink>
            ) : (
              <>
                <MenuLink href="/host" onGo={() => setOpen(false)} icon={<Sliders />}>
                  Host dashboard
                </MenuLink>
                <MenuLink href="/account" onGo={() => setOpen(false)} icon={<UserIcon />}>
                  Account settings
                </MenuLink>
              </>
            )}
            <li role="none" className="my-1.5 border-t border-line" />
            <li role="none">
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  void supabase.auth.signOut();
                }}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold text-loss transition hover:bg-loss-soft"
              >
                <LogOut />
                Sign out
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
  onGo,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onGo: () => void;
}) {
  return (
    <li role="none">
      <Link
        role="menuitem"
        href={href}
        onClick={onGo}
        className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-ink transition hover:bg-paper-2"
      >
        {icon}
        {children}
      </Link>
    </li>
  );
}
