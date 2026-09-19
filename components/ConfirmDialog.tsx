"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./ui";

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  /** the confirming button's label — name the action ("Delete session"), never "OK" */
  confirmLabel: string;
  cancelLabel?: string;
  /** danger = red confirm, for anything that cannot be undone */
  tone?: "danger" | "default";
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * The site's own confirm dialog, replacing `window.confirm` — which looks like a
 * browser error, cannot be styled, and some browsers suppress after a few uses.
 *
 * `const confirm = useConfirm(); if (await confirm({...})) doIt();`
 *
 * Focus starts on Cancel (so a stray Enter never deletes anything), Escape and
 * a click on the backdrop cancel, Tab stays inside, and focus returns to
 * whatever opened it.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<
    (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  >(null);

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...opts, resolve });
      }),
    [],
  );

  const close = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
    },
    [pending],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? <Dialog opts={pending} onClose={close} /> : null}
    </ConfirmContext.Provider>
  );
}

function Dialog({ opts, onClose }: { opts: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    // The page behind must not scroll under the dialog.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose(false);
      return;
    }
    if (e.key !== "Tab") return;
    // Keep Tab inside: the dialog has exactly two stops.
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>("button");
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(false);
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={opts.body ? bodyId : undefined}
        className="w-full max-w-md animate-pop-in rounded-2xl border-2 border-ink bg-surface p-6 shadow-lift"
      >
        <h2 id={titleId} className="font-display text-xl font-black uppercase tracking-tight text-ink">
          {opts.title}
        </h2>
        {opts.body ? (
          <div id={bodyId} className="mt-2 space-y-2 text-sm leading-relaxed text-ink-muted">
            {opts.body}
          </div>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={() => onClose(false)}>
            {opts.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={opts.tone === "danger" ? "danger" : "primary"}
            onClick={() => onClose(true)}
          >
            {opts.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider> (see app/layout.tsx)");
  return ctx;
}
