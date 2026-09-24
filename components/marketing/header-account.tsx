"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { useProfile } from "@/components/use-profile";
import { clsx } from "@/components/clsx";
import { LogOut, Sliders, User as UserIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import type { ProfileRow } from "@/lib/auth/account";
import { AvatarSkeleton, SheetAccountSkeleton } from "@/components/marketing/header-account-skeletons";

/**
 * The account half of the site header — the only part that needs supabase-js,
 * so SiteHeader loads this module as an async chunk after hydration and the
 * marketing page's first load stays light.
 *
 * Two views of one account:
 *   AvatarMenu    wide screens: an avatar button and its dropdown menu
 *   SheetAccount  the phone menu's account section
 *
 * AvatarMenu is always mounted (CSS hides it on narrow screens), so it also
 * owns keeping `html[data-auth]` true: the inline cookie hint drew the right
 * variant before any JS ran, and this corrects it if the cookie was stale and
 * follows every sign-in and sign-out after that.
 */

interface HeaderAccount {
  user: User | null;
  loading: boolean;
  guest: boolean;
  profile: ProfileRow | null;
  /** what the avatar and the menu call this person */
  name: string;
  initial: string;
  /** the menu's first line: display name, else username, else email */
  heading: string;
  signOut: () => Promise<void>;
}

function useHeaderAccount(): HeaderAccount {
  const { supabase, user, loading } = useSupabaseUser();
  const { profile, loading: profileLoading } = useProfile(supabase, user?.id ?? null);
  const toast = useToast();
  const router = useRouter();
  const guest = Boolean(user?.is_anonymous);

  const name = guest ? "Guest" : profile?.username ?? user?.email ?? "Account";
  return {
    user,
    // A real account waits for its profile too, so the avatar never flashes the
    // email's initial and then the username's.
    loading: loading || Boolean(user && !guest && profileLoading),
    guest,
    profile,
    name,
    initial: (name.trim()[0] ?? "?").toUpperCase(),
    heading: profile?.display_name?.trim() || name,
    async signOut() {
      await supabase.auth.signOut();
      toast("Signed out");
      // Leave the page: /account and /host are pages for a signed-in person.
      router.push("/");
    },
  };
}

/** Keeps the CSS switch (globals.css, `.auth-in` / `.auth-out`) in step. */
function useAuthAttribute(user: User | null, loading: boolean) {
  useEffect(() => {
    if (loading) return;
    document.documentElement.dataset.auth = user ? "in" : "out";
  }, [user, loading]);
}

/** A guest cannot sign back in: their session, once dropped, is gone for good. */
function GuestWarning() {
  return (
    <p className="px-3 pb-1 pt-0.5 font-editorial text-xs italic text-ink-muted">
      Guests can&apos;t sign back in. You&apos;ll lose your games.
    </p>
  );
}

function Avatar({ initial, guest, className }: { initial: string; guest: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full font-mono font-black",
        guest ? "bg-ink text-paper-inverse" : "bg-brand text-ink",
        className,
      )}
    >
      {initial}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Wide screens: avatar button + menu (WAI-ARIA menu button pattern)
// ---------------------------------------------------------------------------
export function AvatarMenu() {
  const account = useHeaderAccount();
  const { user, loading, guest, profile, name, initial, heading } = account;
  useAuthAttribute(user, loading);

  const [open, setOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Which end of the menu to focus when it opens: ArrowUp opens onto the last item.
  const [focusEnd, setFocusEnd] = useState<"first" | "last">("first");
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) {
      setConfirmLeave(false);
      return;
    }
    const list = items();
    (focusEnd === "last" ? list[list.length - 1] : list[0])?.focus();
  }, [open, focusEnd]);

  // A click anywhere else closes it — a menu you can only leave by choosing
  // something from it is a trap.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  if (loading || !user) return <AvatarSkeleton />;

  function openAt(end: "first" | "last") {
    setFocusEnd(end);
    setOpen(true);
  }

  function closeAndReturn() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (j: number) => {
      e.preventDefault();
      list[(j + list.length) % list.length]?.focus();
    };
    switch (e.key) {
      case "ArrowDown":
        return go(i + 1);
      case "ArrowUp":
        return go(i - 1);
      case "Home":
        return go(0);
      case "End":
        return go(list.length - 1);
      case "Escape":
        e.preventDefault();
        return closeAndReturn();
      case "Tab":
        // Tab leaves the menu, and the menu closes behind it.
        setOpen(false);
        return;
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openAt("first"))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openAt(e.key === "ArrowUp" ? "last" : "first");
          } else if (e.key === "Escape" && open) {
            setOpen(false);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={guest ? "Guest menu" : `Account menu for ${name}`}
        className={clsx(
          "flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink transition",
          "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
          open ? "translate-x-[2px] translate-y-[2px]" : "shadow-card",
          guest ? "bg-ink" : "bg-brand hover:bg-brand-strong",
        )}
      >
        <Avatar initial={initial} guest={guest} className="h-full w-full text-sm" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={guest ? "Guest" : "Account"}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-50 mt-3 w-64 animate-pop-in overflow-hidden rounded-2xl border-2 border-ink bg-surface shadow-lift"
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
                <p className="truncate font-display text-sm font-extrabold text-ink">{heading}</p>
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

          <div className="p-1.5">
            {guest ? (
              <MenuLink href="/account" icon={<UserIcon />} onGo={() => setOpen(false)}>
                Create an account
              </MenuLink>
            ) : (
              <>
                <MenuLink href="/host" icon={<Sliders />} onGo={() => setOpen(false)}>
                  Host dashboard
                </MenuLink>
                <MenuLink href="/account" icon={<UserIcon />} onGo={() => setOpen(false)}>
                  Account settings
                </MenuLink>
              </>
            )}
            <div role="separator" className="my-1.5 border-t border-line/20" />
            {guest && confirmLeave ? <GuestWarning /> : null}
            <button
              role="menuitem"
              tabIndex={-1}
              type="button"
              onClick={() => {
                if (guest && !confirmLeave) {
                  setConfirmLeave(true);
                  return;
                }
                setOpen(false);
                void account.signOut();
              }}
              className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold text-loss transition hover:bg-loss-soft focus-visible:bg-loss-soft"
            >
              <LogOut />
              {guest && confirmLeave ? "Sign out anyway" : "Sign out"}
            </button>
          </div>
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
    <Link
      role="menuitem"
      tabIndex={-1}
      href={href}
      onClick={onGo}
      className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-ink transition hover:bg-paper-2 focus-visible:bg-paper-2"
    >
      {icon}
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Phones: the account section of the header's menu sheet
// ---------------------------------------------------------------------------
export function SheetAccount({ onNavigate }: { onNavigate: () => void }) {
  const account = useHeaderAccount();
  const { user, loading, guest, name, initial, heading } = account;
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (loading) return <SheetAccountSkeleton />;
  // The cookie hint said signed in, but nobody is: AvatarMenu flips the
  // attribute and the signed-out links take this section's place.
  if (!user) return null;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-3 py-3">
        <Avatar initial={initial} guest={guest} className="h-9 w-9 border-2 border-ink text-sm" />
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-extrabold text-ink">
            {guest ? "Playing as a guest" : heading}
          </p>
          {!guest && user.email && user.email !== heading ? (
            <p className="truncate font-mono text-xs text-ink-muted">{user.email}</p>
          ) : !guest && name !== heading ? (
            <p className="truncate font-mono text-xs text-ink-muted">@{name}</p>
          ) : null}
        </div>
      </div>
      <Link
        href="/account"
        onClick={onNavigate}
        className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-base font-semibold text-ink transition hover:bg-paper-2"
      >
        <UserIcon className="text-ink-muted" />
        {guest ? "Create an account" : "Account settings"}
      </Link>
      {guest && confirmLeave ? <GuestWarning /> : null}
      <button
        type="button"
        onClick={() => {
          if (guest && !confirmLeave) {
            setConfirmLeave(true);
            return;
          }
          onNavigate();
          void account.signOut();
        }}
        className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-base font-semibold text-loss transition hover:bg-loss-soft"
      >
        <LogOut />
        {guest && confirmLeave ? "Sign out anyway" : "Sign out"}
      </button>
    </div>
  );
}
