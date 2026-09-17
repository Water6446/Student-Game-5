"use client";

import { useEffect, useState, type ComponentType } from "react";
import { ArrowRight, Coins } from "@/components/icons";
import { PillLink } from "@/components/marketing/primitives";
import { LOGGED_OUT_CTA, type CtaIcon, type CTA_TONE } from "@/components/marketing/cta-shared";

/**
 * A marketing call to action that knows who is looking: "Host a session" for
 * someone who can host, "Log in" for everyone else. Hosting is never offered to
 * a visitor who cannot do it yet.
 *
 * Two things are being balanced here.
 *
 * The landing page is deliberately light, and supabase-js is ~70 kB, so the part
 * that reads the session is a separate module fetched after hydration. But a
 * dynamic import with no fallback leaves a hole where the page's main button
 * should be, which is far worse on a hero than a brief wrong label.
 *
 * So the signed-out pill renders on the server and stands in until the live
 * component arrives. That is already correct for the large majority of landing
 * page visitors; the few who are signed in see it settle to "Host a session".
 */
type Props = {
  tone: CTA_TONE;
  icon: CtaIcon;
  /** Label once we know the visitor can host. */
  hostLabel: string;
  className?: string;
};

export function HostOrLoginCta({ tone, icon, hostLabel, className }: Props) {
  const [Live, setLive] = useState<ComponentType<Props> | null>(null);

  useEffect(() => {
    let active = true;
    void import("@/components/marketing/auth-cta-live").then((m) => {
      if (active) setLive(() => m.HostCtaLive);
    });
    return () => {
      active = false;
    };
  }, []);

  if (Live) return <Live tone={tone} icon={icon} hostLabel={hostLabel} className={className} />;

  return (
    <PillLink
      href={LOGGED_OUT_CTA.href}
      label={LOGGED_OUT_CTA.label}
      icon={icon === "coins" ? <Coins /> : <ArrowRight />}
      tone={tone}
      className={className}
    />
  );
}
