import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { ChatWidget } from "./ChatWidget";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  return (
    <>
      <DashboardClient />
      <div className="mx-auto max-w-4xl px-8 pb-8">
        <ChatWidget />
      </div>
    </>
  );
}
