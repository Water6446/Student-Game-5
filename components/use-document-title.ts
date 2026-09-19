"use client";

import { useEffect } from "react";
import { SITE } from "@/lib/marketing/content";

/**
 * Sets the browser tab title from a client page, in the same "Page · Site"
 * shape as the root layout's metadata template. For titles that depend on live
 * data — "Round 3/25 · ABCD" — which static route metadata cannot know.
 *
 * A host runs the control screen and the projector in two tabs; without this
 * both read "The Risk Game". Pass null while the data is loading to leave the
 * route's static title in place.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · ${SITE.name}`;
  }, [title]);
}
