"use client";

import { useEffect } from "react";
import { StatusPage } from "@/components/StatusPage";
import { Button } from "@/components/ui";
import { feedbackHref } from "@/lib/feedback";

/**
 * A crash inside any page. The header and footer still render (they are
 * outside the failed page), so the way out stays on screen; "Try again"
 * re-renders just the page without a full reload, which keeps a student's
 * sign-in and a host's open tabs intact.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      eyebrow="Something went wrong"
      title="This page hit a snag"
      body="This screen failed to load. Try again, and if it keeps happening, let me know what you were doing."
      primary={{ label: "Go home", href: "/" }}
      secondary={[{ label: "Report it", href: feedbackHref({ topic: "error" }) }]}
    >
      <Button variant="secondary" onClick={reset} className="mt-3 w-full">
        Try again
      </Button>
    </StatusPage>
  );
}
