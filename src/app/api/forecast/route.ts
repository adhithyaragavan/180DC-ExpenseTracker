import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getSpendingForecast } from "@/lib/forecast";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forecast = await getSpendingForecast(session.user.id);

  return NextResponse.json(forecast);
}
