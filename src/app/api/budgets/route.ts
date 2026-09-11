import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const budgets = await prisma.budget.findMany({
    where: { userId: session.user.id },
    include: { category: true },
  });

  return NextResponse.json(budgets);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  const monthlyLimit = body?.monthlyLimit;
  if (
    typeof monthlyLimit !== "number" ||
    !Number.isFinite(monthlyLimit) ||
    monthlyLimit <= 0
  ) {
    return NextResponse.json(
      { error: "monthlyLimit must be a positive number" },
      { status: 400 },
    );
  }

  const categoryId = body?.categoryId;
  if (typeof categoryId !== "string" || categoryId.length === 0) {
    return NextResponse.json(
      { error: "categoryId is required" },
      { status: 400 },
    );
  }

  // Same as Transaction's POST: the FK only proves the category exists,
  // not that it belongs to this user — verify ownership explicitly.
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });
  if (!category || category.userId !== session.user.id) {
    return NextResponse.json(
      { error: "categoryId does not exist or does not belong to you" },
      { status: 400 },
    );
  }

  const budget = await prisma.budget.create({
    data: { monthlyLimit, userId: session.user.id, categoryId },
    include: { category: true },
  });

  return NextResponse.json(budget, { status: 201 });
}
