import { PageSkeleton } from "@/components/ui";

/**
 * Shown the instant a host opens a session (from the dashboard, or right after
 * creating one), while the route loads. The same skeleton the page shows while
 * its data arrives, so the two hand over without a flicker.
 */
export default function Loading() {
  return <PageSkeleton label="Loading session" width="max-w-5xl" />;
}
