import { HomeTabs } from "@/components/HomeTabs";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Investment Risk Game</h1>
        <p className="mt-4 text-lg text-slate-400">
          A live, in-class simulation. Split your wealth between a safe and a risky asset each
          round and see how you stack up against the class.
        </p>
      </div>

      <HomeTabs />
    </main>
  );
}
