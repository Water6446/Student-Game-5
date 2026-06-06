"use client";

import { clsx } from "./clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl", className)}>
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
    primary: "bg-indigo-500 hover:bg-indigo-400 text-white disabled:bg-slate-700",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-100 disabled:opacity-50",
    danger: "bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50",
  };
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-xl px-5 py-3 text-base font-semibold transition disabled:cursor-not-allowed",
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
      <span className="mb-1 block text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-slate-100 placeholder:text-slate-600",
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
        "w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-slate-100",
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
      className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
    >
      <span className="text-sm font-medium text-slate-300">{label}</span>
      <span
        className={clsx(
          "relative h-6 w-11 rounded-full transition",
          checked ? "bg-indigo-500" : "bg-slate-700",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Banner({ kind, children }: { kind: "error" | "info" | "success"; children: ReactNode }) {
  const styles = {
    error: "border-rose-800 bg-rose-950/60 text-rose-200",
    info: "border-sky-800 bg-sky-950/60 text-sky-200",
    success: "border-emerald-800 bg-emerald-950/60 text-emerald-200",
  };
  return (
    <div className={clsx("rounded-xl border px-4 py-3 text-sm", styles[kind])} role="alert">
      {children}
    </div>
  );
}
