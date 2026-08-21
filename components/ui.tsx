"use client";

import { clsx } from "./clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-2xl border-2 border-ink bg-surface p-6 shadow-card",
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
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "gold" | "secondary" | "success" | "danger";
}) {
  const variants = {
    primary: "bg-play text-white shadow-card hover:brightness-110", // electric blue
    gold: "bg-brand text-ink shadow-card hover:bg-brand-strong", // amber, INK text
    secondary: "bg-surface text-ink shadow-card hover:bg-paper-2",
    success: "bg-gain text-white shadow-card hover:brightness-110",
    danger: "bg-loss text-white shadow-card hover:brightness-110",
  };
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-ink px-5 py-3 text-base",
        "font-display font-extrabold transition active:translate-x-[2px] active:translate-y-[2px]",
        "active:shadow-none disabled:cursor-not-allowed disabled:opacity-60",
        "disabled:active:translate-x-0 disabled:active:translate-y-0",
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
        "w-full rounded-xl border-2 border-ink bg-surface px-4 py-3 text-base font-semibold text-ink shadow-card",
        "placeholder:font-normal placeholder:text-ink-subtle transition focus:border-brand",
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
        "w-full rounded-xl border-2 border-ink bg-surface px-4 py-3 text-base font-semibold text-ink shadow-card",
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
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        "flex items-center justify-between rounded-xl border-2 border-ink bg-surface px-4 py-3 shadow-card transition hover:bg-paper-2",
        className ? className : "w-full"
      )}
    >
      <span className="text-sm font-semibold text-ink">{label}</span>
      <span
        className={clsx(
          "relative h-6 w-11 rounded-full border-2 border-ink transition-colors",
          checked ? "bg-play" : "bg-paper-2",
        )}
      >
        <span
          className={clsx(
            "absolute top-[1px] h-[18px] w-[18px] rounded-full border border-ink bg-white transition-all",
            checked ? "left-[20px]" : "left-[1px]",
          )}
        />
      </span>
    </button>
  );
}

export function Banner({ kind, children }: { kind: "error" | "info" | "success"; children: ReactNode }) {
  const styles = {
    error: "bg-loss-soft text-loss",
    info: "bg-play-soft text-play",
    success: "bg-gain-soft text-gain",
  };
  return (
    <div
      className={clsx(
        "rounded-xl border-2 border-ink px-4 py-3 text-sm font-semibold shadow-card",
        styles[kind],
      )}
      role="alert"
    >
      {children}
    </div>
  );
}
