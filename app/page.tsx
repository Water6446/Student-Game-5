import Link from "next/link";
import { Coins, TrendUp, Users, ArrowRight } from "@/components/icons";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <div className="animate-rise">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border-2 border-ink bg-play-soft px-4 py-1.5 text-sm font-extrabold text-ink shadow-card">
          <Coins className="text-[1.05em]" />
          Live in-class simulation
        </span>
        <h1 className="font-display text-5xl font-black uppercase leading-[.92] tracking-tight text-ink sm:text-7xl">
          Play the market.
        </h1>
        <p className="mx-auto mt-5 max-w-xl font-editorial text-lg italic text-ink-muted">
          Split your wealth between a <span className="font-semibold not-italic text-gain">safe</span>{" "}
          and a <span className="font-semibold not-italic text-loss">risky</span> asset each round,
          watch the market turn, and see how you stack up against the class.
        </p>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-2">
        <Link
          href="/join"
          className="group flex flex-col items-start gap-3 rounded-2xl border-2 border-ink bg-brand-soft p-7 text-left shadow-lift transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-ink bg-brand text-xl text-ink">
            <TrendUp />
          </span>
          <div className="font-display text-2xl font-extrabold text-ink">I&apos;m a student</div>
          <div className="font-editorial italic text-ink-muted">Join a game with a code or QR</div>
          <span className="mt-1 inline-flex items-center gap-1 text-sm font-extrabold text-ink">
            Join now <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link
          href="/host"
          className="group flex flex-col items-start gap-3 rounded-2xl border-2 border-ink bg-surface p-7 text-left shadow-lift transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-ink bg-ink text-xl text-paper">
            <Users />
          </span>
          <div className="font-display text-2xl font-extrabold text-ink">I&apos;m the professor</div>
          <div className="font-editorial italic text-ink-muted">Host and run a session</div>
          <span className="mt-1 inline-flex items-center gap-1 text-sm font-extrabold text-ink">
            Open dashboard <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </main>
  );
}
