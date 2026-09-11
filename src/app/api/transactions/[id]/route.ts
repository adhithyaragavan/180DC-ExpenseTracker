import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getOwnedTransaction(id: string, userId: string) {
  const transaction = await prisma.transaction.findUnique({ where: { id } });
  if (!transaction || transaction.userId !== userId) {
    return null;
  }
  return transaction;
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

  // Look up by id alone, then compare userId in code — an existing
  // transaction owned by someone else and a nonexistent id must be
  // indistinguishable (both 404) to avoid leaking which ids exist.
  const existing = await getOwnedTransaction(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const data: {
    amount?: number;
    type?: "income" | "expense";
    note?: string | null;
    date?: Date;
    categoryId?: string;
  } = {};

  if (body?.amount !== undefined) {
    const amount = body.amount;
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 },
      );
    }
    data.amount = amount;
  }

  if (body?.type !== undefined) {
    if (body.type !== "income" && body.type !== "expense") {
      return NextResponse.json(
        { error: 'type must be "income" or "expense"' },
        { status: 400 },
      );
    }
    data.type = body.type;
  }

  if (body?.note !== undefined) {
    data.note = typeof body.note === "string" ? body.note : null;
  }

  if (body?.date !== undefined) {
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "date is invalid" }, { status: 400 });
    }
    data.date = date;
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

  const transaction = await prisma.transaction.update({
    where: { id },
    data,
    include: { category: true },
  });

  return NextResponse.json(transaction);
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

  const existing = await getOwnedTransaction(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.transaction.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
