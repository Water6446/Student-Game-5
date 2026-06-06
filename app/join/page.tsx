import { Suspense } from "react";
import { JoinForm } from "@/components/JoinForm";

export default function JoinPage() {
  return (
    <Suspense
      fallback={<main className="flex min-h-screen items-center justify-center text-slate-500">Loading…</main>}
    >
      <JoinForm />
    </Suspense>
  );
}
