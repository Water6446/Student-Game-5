"use client";

import { useEffect, useId, useRef, useState } from "react";
import { clsx } from "./clsx";
import { Toggle } from "./ui";
import { Gear, Sparkle, X } from "./icons";
import { FUN_SETTINGS, useFun, type FunSetting } from "./use-fun";

/**
 * The host's settings menu: a gear in the masthead toolbar (and the projector
 * header) opening a small panel. For now it holds the "Fun" section — the
 * flourishes a host can switch off or on for this device. The trigger takes
 * its look from `className`, so it sits in whichever bar it is placed in.
 */
export function SettingsMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative flex">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label="Settings"
        title="Settings"
        onClick={() => setOpen((v) => !v)}
        className={clsx(className, open && "bg-brand-soft text-ink")}
      >
        <Gear className={clsx("transition-transform duration-300", open && "rotate-90")} />
        <span className="hidden sm:inline">Settings</span>
      </button>
      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label="Settings"
          className={clsx(
            "z-40 animate-pop-in overflow-hidden rounded-xl border-2 border-ink bg-surface text-left shadow-lift",
            // a sheet across the top on a phone; a panel under the gear above
            "max-sm:fixed max-sm:inset-x-4 max-sm:top-16",
            "sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem]",
          )}
        >
          <header className="flex min-h-[44px] items-center justify-between border-b-[1.5px] border-ink/20 bg-paper-2 pl-4 pr-1">
            <h2 className="font-display text-[0.75rem] font-extrabold uppercase tracking-[0.12em] text-ink">
              Settings
            </h2>
            <button
              type="button"
              aria-label="Close settings"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition hover:bg-ink/[0.06] hover:text-ink"
            >
              <X />
            </button>
          </header>
          <section className="px-4 pb-4 pt-3">
            <h3 className="flex items-center gap-1.5 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">
              <Sparkle /> Fun
            </h3>
            <FunSettingsList />
            <p className="mt-2 font-editorial text-xs italic text-ink-subtle">
              Saved on this device. An open projector tab follows along.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}

/** The Fun switches as a ruled list: the settings menu and the account page. */
export function FunSettingsList() {
  return (
    <ul className="mt-1 divide-y-[1.5px] divide-ink/10">
      {(Object.keys(FUN_SETTINGS) as FunSetting[]).map((name) => (
        <FunRow key={name} name={name} />
      ))}
    </ul>
  );
}

function FunRow({ name }: { name: FunSetting }) {
  const [on, set] = useFun(name);
  const s = FUN_SETTINGS[name];
  return (
    <li>
      <Toggle checked={on} onChange={set} label={s.label} hint={s.hint} className="w-full px-1" />
    </li>
  );
}
