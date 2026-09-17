"use client";

import Link from "next/link";

import { ArrowRight, Coins } from "@/components/icons";
import { PillLink } from "@/components/marketing/primitives";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { canHost } from "@/lib/auth/can-host";
import { LOGGED_OUT_CTA, type CtaIcon, CTA_TONE } from "@/components/marketing/cta-shared";

/**
 * The live halves of the auth-aware calls to action.
 *
 * Both live in one module so the page shares a single async chunk: the hero
 * pill, the closing band's pill and the footer link would otherwise pull
 * supabase-js in three times over. The wrappers (HostOrLoginCta,
 * HostOrLoginNavLink) render the signed-out version until this arrives.
 */
export function HostCtaLive({
  tone,
  icon,
  hostLabel,
  className,
}: {
  tone: CTA_TONE;
  icon: CtaIcon;
  hostLabel: string;
  className?: string;
}) {
  const { user, loading } = useSupabaseUser();
  // canHost(), not "is there a user": while the anonymous testing bypass is on,
  // a guest really can host, and the button should say so.
  const hosting = !loading && canHost(user);

  return (
    <PillLink
      href={hosting ? "/host" : LOGGED_OUT_CTA.href}
      label={hosting ? hostLabel : LOGGED_OUT_CTA.label}
      icon={icon === "coins" ? <Coins /> : <ArrowRight />}
      tone={tone}
      className={className}
    />
  );
}

/**
 * The footer's quiet nav equivalent of the pill above. Same rule: hosting is
 * only named for someone who can do it.
 */
export function HostNavLinkLive({
  hostLabel,
  className,
}: {
  hostLabel: string;
  className?: string;
}) {
  const { user, loading } = useSupabaseUser();
  const hosting = !loading && canHost(user);
  return (
    <Link href={hosting ? "/host" : LOGGED_OUT_CTA.href} className={className}>
      {hosting ? hostLabel : LOGGED_OUT_CTA.label}
    </Link>
  );
}
