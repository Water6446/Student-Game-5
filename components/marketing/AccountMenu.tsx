"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { useProfile } from "@/components/use-profile";
import { clsx } from "@/components/clsx";
import { ChevronDown, LogOut, Sliders, User as UserIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { canHost } from "@/lib/auth/can-host";
import { HEADER } from "@/lib/marketing/content";

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
 *
 * It also owns the bar's one amber action, because that button depends on who is
 * looking: "Host a session" is pointless for someone who cannot host yet, so
 * signed out it reads "Log in" and points at /login instead. canHost() (not
 * "is there a user") decides, so the anonymous testing bypass still gets a way
 * through to the dashboard while that flag is on.
 */
export function AccountMenu() {
  const { supabase, user, loading } = useSupabaseUser();
  const { profile, loading: profileLoading } = useProfile(supabase, user?.id ?? null);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  // A guest cannot sign back in: an anonymous session, once dropped, is gone,
  // and with it their seat in any game still running (and, while the testing
  // bypass is on, every session they hosted). So for a guest, sign-out asks once.
  const [confirmLeave, setConfirmLeave] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setConfirmLeave(false);
  }, [open]);

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
  // Holds the amber action's footprint so the bar neither reflows nor overflows
  // while the session resolves.
  //
  // Also while a real account's profile is on its way (only when nothing is
  // cached, e.g. a fresh tab). Filling the gap with the email address showed
  // the email for a split second before the username on every reload.
  const guest = Boolean(user?.is_anonymous);
  if (loading || (user && !guest && profileLoading)) {
    return <span aria-hidden className="inline-block h-[44px] w-[92px]" />;
  }

  // Signed out: no dropdown, and the amber action is the way in.
  if (!user) return <AmberCta href={HEADER.loginCta.href} label={HEADER.loginCta.label} />;

  // The email is a fallback ONLY for an account that really has no profile row
  // (a guest partway through claiming one); `profileLoading` is false by now.
  const name = guest ? "Guest" : profile?.username ?? user.email ?? "Account";
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  // What the panel leads with. Falls back through display name -> username ->
  // email, which is also what `name` does when there is no profile row yet.
  const heading = profile?.display_name?.trim() || name;

  const hosting = canHost(user);

  return (
    <>
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
                    <p
                      className="mt-0.5 truncate font-mono text-xs text-ink-muted"
                      title={user.email}
                    >
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
              {guest && confirmLeave ? (
                <li role="none" className="px-3 pb-1 pt-0.5 font-editorial text-xs italic text-ink-muted">
                  Guests can&apos;t sign back in. You&apos;ll lose your games.
                </li>
              ) : null}
              <li role="none">
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    if (guest && !confirmLeave) {
                      setConfirmLeave(true);
                      return;
                    }
                    setOpen(false);
                    void supabase.auth.signOut().then(() => toast("Signed out"));
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold text-loss transition hover:bg-loss-soft"
                >
                  <LogOut />
                  {guest && confirmLeave ? "Sign out anyway" : "Sign out"}
                </button>
              </li>
            </ul>
          </div>
        ) : null}
      </div>

      {hosting ? (
        <AmberCta
          href={HEADER.hostCta.href}
          label={HEADER.hostCta.label}
          shortLabel={HEADER.hostCtaShort}
        />
      ) : (
        // A guest with the bypass off: signed in, but not as anyone who can host.
        <AmberCta href={HEADER.loginCta.href} label={HEADER.loginCta.label} />
      )}
    </>
  );
}

/** The bar's single amber action. One shape, whichever destination it carries. */
function AmberCta({
  href,
  label,
  shortLabel,
}: {
  href: string;
  label: string;
  /** Optional phone-width label; falls back to `label`. */
  shortLabel?: string;
}) {
  // A prominent button that reloads the page you are already on is worse than
  // no button: now that this header rides on /host and /login, drop it there.
  const pathname = usePathname();
  if (pathname === href) return null;

  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border-2 border-ink bg-brand px-5 font-display text-sm font-extrabold text-ink transition hover:bg-brand-strong active:translate-x-[1px] active:translate-y-[1px]"
    >
      {shortLabel ? (
        <>
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{shortLabel}</span>
        </>
      ) : (
        label
      )}
    </Link>
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
