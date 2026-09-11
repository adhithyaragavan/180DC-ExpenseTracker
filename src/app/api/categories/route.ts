import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categories = await prisma.category.findMany({
    where: { userId: session.user.id },
  });

  return NextResponse.json(categories);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  const name = body?.name;
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "name must be a non-empty string" },
      { status: 400 },
    );
  }

  const category = await prisma.category.create({
    data: { name, userId: session.user.id },
  });

  return NextResponse.json(category, { status: 201 });
}
