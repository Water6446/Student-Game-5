"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * DEV ONLY: renders its children after mount. The preview builds its whole
 * session synchronously, so a server render would bake in the server's clock
 * and origin (the countdown, the join URL) and fail to hydrate. The live
 * screens never need this: they render from data fetched on the client.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : null;
}
