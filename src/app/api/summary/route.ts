import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getSpendingSummary } from "@/lib/summary";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await getSpendingSummary(session.user.id);

  return NextResponse.json(summary);
}
