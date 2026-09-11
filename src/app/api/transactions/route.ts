import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const transactions = await prisma.transaction.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "desc" },
    include: { category: true },
  });

  return NextResponse.json(transactions);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  const amount = body?.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number" },
      { status: 400 },
    );
  }

  const type = body?.type;
  if (type !== "income" && type !== "expense") {
    return NextResponse.json(
      { error: 'type must be "income" or "expense"' },
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

  const note = typeof body?.note === "string" ? body.note : null;

  let date: Date | undefined;
  if (body?.date !== undefined) {
    date = new Date(body.date);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "date is invalid" }, { status: 400 });
    }
  }

  // The categoryId foreign key only guarantees the category exists, not
  // that it belongs to this user — verify ownership explicitly rather
  // than trusting the FK.
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });
  if (!category || category.userId !== session.user.id) {
    return NextResponse.json(
      { error: "categoryId does not exist or does not belong to you" },
      { status: 400 },
    );
  }

  const transaction = await prisma.transaction.create({
    data: {
      amount,
      type,
      note,
      ...(date ? { date } : {}),
      userId: session.user.id,
      categoryId,
    },
    include: { category: true },
  });

  return NextResponse.json(transaction, { status: 201 });
}
