"use client";

import dynamic from "next/dynamic";

/**
 * Same trick as AccountMenuSlot: the homepage is a Server Component and most
 * visitors are signed out, so the resume strip — which needs the Supabase
 * client — arrives as an async chunk after hydration. No placeholder: for the
 * signed-out majority it renders nothing, and reserving space would leave a gap.
 */
const HomeResume = dynamic(
  () => import("@/components/marketing/HomeResume").then((m) => m.HomeResume),
  { ssr: false },
);

export function HomeResumeSlot() {
  return <HomeResume />;
}
