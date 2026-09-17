"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import { LOGGED_OUT_CTA } from "@/components/marketing/cta-shared";

/**
 * The footer's host link, which — like the pills — must not offer hosting to
 * someone who cannot host yet. Same lazy split as HostOrLoginCta: the signed-out
 * link renders on the server, and the live version swaps in from the shared
 * async chunk after hydration.
 */
type Props = { hostLabel: string; className?: string };

export function HostOrLoginNavLink({ hostLabel, className }: Props) {
  const [Live, setLive] = useState<ComponentType<Props> | null>(null);

  useEffect(() => {
    let active = true;
    void import("@/components/marketing/auth-cta-live").then((m) => {
      if (active) setLive(() => m.HostNavLinkLive);
    });
    return () => {
      active = false;
    };
  }, []);

  if (Live) return <Live hostLabel={hostLabel} className={className} />;

  return (
    <Link href={LOGGED_OUT_CTA.href} className={className}>
      {LOGGED_OUT_CTA.label}
    </Link>
  );
}
