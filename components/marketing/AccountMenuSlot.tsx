"use client";

import dynamic from "next/dynamic";

/**
 * Keeps supabase-js out of the landing page's first load.
 *
 * The header needs to know who is signed in, but the marketing page is
 * deliberately light and the Supabase client is ~70 kB — most visitors are not
 * signed in and will never open this menu. So the real component is an async
 * chunk fetched after hydration, and this slot holds its exact footprint in the
 * meantime so the bar never reflows.
 *
 * `ssr: false` is why this thin wrapper is a Client Component: next/dynamic
 * rejects that option inside a Server Component, and SiteHeader is one.
 */
const Placeholder = () => <span aria-hidden className="inline-block h-[44px] w-[44px] sm:w-[88px]" />;

const AccountMenu = dynamic(
  () => import("@/components/marketing/AccountMenu").then((m) => m.AccountMenu),
  { ssr: false, loading: Placeholder },
);

export function AccountMenuSlot() {
  return <AccountMenu />;
}
