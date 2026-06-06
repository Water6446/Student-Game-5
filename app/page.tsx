import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Investment Risk Game</h1>
        <p className="mt-4 text-lg text-slate-400">
          A live, in-class simulation. Split your wealth between a safe and a risky asset each
          round and see how you stack up against the class.
        </p>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-2">
        <Link
          href="/join"
          className="rounded-2xl border border-indigo-700 bg-indigo-600/20 p-8 transition hover:bg-indigo-600/30"
        >
          <div className="text-2xl font-semibold text-indigo-200">I&apos;m a student</div>
          <div className="mt-2 text-slate-400">Join a game with a code or QR</div>
        </Link>
        <Link
          href="/host"
          className="rounded-2xl border border-slate-700 bg-slate-800/40 p-8 transition hover:bg-slate-800/70"
        >
          <div className="text-2xl font-semibold text-slate-200">I&apos;m the professor</div>
          <div className="mt-2 text-slate-400">Host and run a session</div>
        </Link>
      </div>
    </main>
  );
}
