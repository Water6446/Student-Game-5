import Link from "next/link";

export default function AuthError() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-semibold">Sign-in link expired</h1>
      <p className="text-slate-400">
        That magic link is invalid or has already been used. Request a fresh one.
      </p>
      <Link href="/host" className="rounded-xl bg-indigo-500 px-5 py-3 font-semibold text-white">
        Back to host sign-in
      </Link>
    </main>
  );
}
