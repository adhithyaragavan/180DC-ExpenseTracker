import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { BudgetsClient } from "./BudgetsClient";

export default async function BudgetsPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  return <BudgetsClient />;
}
