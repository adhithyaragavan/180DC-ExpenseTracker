import Link from "next/link";

import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Expense Tracker</h1>
      <p className="text-sm text-zinc-600">
        Track income, expenses, budgets, and get AI-powered spending insights.
      </p>
      {session ? (
        <Link
          href="/dashboard"
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          Go to Dashboard
        </Link>
      ) : (
        <div className="flex gap-3">
          <Link href="/login" className="rounded bg-black px-4 py-2 text-sm text-white">
            Log in
          </Link>
          <Link href="/signup" className="rounded border px-4 py-2 text-sm">
            Sign up
          </Link>
        </div>
      )}
    </main>
  );
}
