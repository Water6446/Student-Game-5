"use client";

import { clsx } from "./clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-line bg-surface p-6 shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const variants = {
    primary:
      "bg-brand text-white hover:bg-brand-strong shadow-card disabled:bg-line-strong disabled:text-ink-subtle disabled:shadow-none",
    secondary:
      "bg-paper-2 text-ink hover:bg-line border border-line-strong disabled:opacity-50",
    danger: "bg-loss text-white hover:brightness-110 disabled:opacity-50",
  };
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold",
        "transition active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-subtle">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "w-full rounded-xl border border-line-strong bg-paper px-4 py-3 text-base text-ink",
        "placeholder:text-ink-subtle transition focus:border-brand",
        props.className,
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "w-full rounded-xl border border-line-strong bg-paper px-4 py-3 text-base text-ink",
        "transition focus:border-brand",
        props.className,
      )}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-xl border border-line-strong bg-paper px-4 py-3 transition hover:border-brand"
    >
      <span className="text-sm font-medium text-ink">{label}</span>
      <span
        className={clsx(
          "relative h-6 w-11 rounded-full transition-colors",
          checked ? "bg-brand" : "bg-line-strong",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Banner({ kind, children }: { kind: "error" | "info" | "success"; children: ReactNode }) {
  const styles = {
    error: "border-loss/30 bg-loss-soft text-loss",
    info: "border-play/30 bg-play-soft text-play",
    success: "border-gain/30 bg-gain-soft text-gain",
  };
  return (
    <div className={clsx("rounded-xl border px-4 py-3 text-sm font-medium", styles[kind])} role="alert">
      {children}
    </div>
  );
}
