"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "./Toast";
import { ConfirmProvider } from "./ConfirmDialog";

/**
 * The app-wide client context: toasts and the confirm dialog. Neither touches
 * Supabase, so wrapping the (server-rendered) marketing page in it costs a few
 * kB, not the auth client.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
