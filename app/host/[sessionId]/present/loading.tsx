import { PageSkeleton } from "@/components/ui";

/** The projector's own placeholder, matching the page's (see ../loading.tsx). */
export default function Loading() {
  return <PageSkeleton label="Loading projector view" width="max-w-6xl" />;
}
