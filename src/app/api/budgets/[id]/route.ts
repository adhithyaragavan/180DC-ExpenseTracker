import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getOwnedBudget(id: string, userId: string) {
  const budget = await prisma.budget.findUnique({ where: { id } });
  if (!budget || budget.userId !== userId) {
    return null;
  }
  return budget;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await getOwnedBudget(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const data: { monthlyLimit?: number; categoryId?: string } = {};

  if (body?.monthlyLimit !== undefined) {
    const monthlyLimit = body.monthlyLimit;
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
    data.monthlyLimit = monthlyLimit;
  }

  if (body?.categoryId !== undefined) {
    const categoryId = body.categoryId;
    if (typeof categoryId !== "string" || categoryId.length === 0) {
      return NextResponse.json(
        { error: "categoryId is invalid" },
        { status: 400 },
      );
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.userId !== session.user.id) {
      return NextResponse.json(
        { error: "categoryId does not exist or does not belong to you" },
        { status: 400 },
      );
    }
    data.categoryId = categoryId;
  }

  const budget = await prisma.budget.update({
    where: { id },
    data,
    include: { category: true },
  });

  return NextResponse.json(budget);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await getOwnedBudget(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.budget.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
