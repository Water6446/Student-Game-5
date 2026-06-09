import Link from "next/link";
import { Coins, TrendUp, Users, ArrowRight } from "@/components/icons";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <div className="animate-rise">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-4 py-1.5 text-sm font-semibold text-brand shadow-card">
          <Coins className="text-[1.05em]" />
          Live in-class simulation
        </span>
        <h1 className="font-display text-5xl font-black tracking-tight text-ink sm:text-6xl">
          The Risk Game
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-muted">
          Split your wealth between a <span className="font-semibold text-gain">safe</span> and a{" "}
          <span className="font-semibold text-loss">risky</span> asset each round, watch the market
          turn, and see how you stack up against the class.
        </p>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-2">
        <Link
          href="/join"
          className="group flex flex-col items-start gap-3 rounded-2xl border border-brand/30 bg-brand-soft/60 p-7 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-xl text-white">
            <TrendUp />
          </span>
          <div className="text-2xl font-bold text-ink">I&apos;m a student</div>
          <div className="text-ink-muted">Join a game with a code or QR</div>
          <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-strong">
            Join now <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link
          href="/host"
          className="group flex flex-col items-start gap-3 rounded-2xl border border-line-strong bg-surface p-7 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-xl text-paper">
            <Users />
          </span>
          <div className="text-2xl font-bold text-ink">I&apos;m the professor</div>
          <div className="text-ink-muted">Host and run a session</div>
          <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-ink">
            Open dashboard <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </main>
  );
}
