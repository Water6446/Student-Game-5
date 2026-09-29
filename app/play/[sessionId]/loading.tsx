import { PageSkeleton } from "@/components/ui";

/**
 * Shown the instant a student is sent here (after joining, or "Rejoin"), while
 * the route loads. The same skeleton the page shows while its data arrives, so
 * the two hand over without a flicker.
 */
export default function Loading() {
  return <PageSkeleton label="Loading your game" width="max-w-lg" />;
}
