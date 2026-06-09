import { Suspense } from "react";
import { JoinForm } from "@/components/JoinForm";

export default function JoinPage() {
  return (
    <Suspense
      fallback={<main className="flex min-h-dvh items-center justify-center text-ink-subtle">Loading…</main>}
    >
      <JoinForm />
    </Suspense>
  );
}
