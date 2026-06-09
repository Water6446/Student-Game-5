import Link from "next/link";

export default function AuthError() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-bold text-ink">Sign-in link expired</h1>
      <p className="text-ink-muted">
        That magic link is invalid or has already been used. Request a fresh one.
      </p>
      <Link
        href="/host"
        className="rounded-xl bg-brand px-5 py-3 font-semibold text-white shadow-card transition hover:bg-brand-strong active:scale-[0.98]"
      >
        Back to host sign-in
      </Link>
    </main>
  );
}
