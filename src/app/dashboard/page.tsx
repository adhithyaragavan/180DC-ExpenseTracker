import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  return <DashboardClient />;
}
