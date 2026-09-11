import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getOwnedCategory(id: string, userId: string) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category || category.userId !== userId) {
    return null;
  }
  return category;
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

  const existing = await getOwnedCategory(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const data: { name?: string } = {};

  if (body?.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 },
      );
    }
    data.name = body.name;
  }

  const category = await prisma.category.update({ where: { id }, data });

  return NextResponse.json(category);
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

  const existing = await getOwnedCategory(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The category's transactions/budgets FKs are ON DELETE RESTRICT at the
  // DB level — deleting a category that's still referenced would fail
  // there regardless. Check proactively so the caller gets a clear,
  // countable reason instead of a raw constraint-violation error.
  const [transactionCount, budgetCount] = await Promise.all([
    prisma.transaction.count({ where: { categoryId: id } }),
    prisma.budget.count({ where: { categoryId: id } }),
  ]);

  if (transactionCount > 0 || budgetCount > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete category: ${transactionCount} transaction(s) and ${budgetCount} budget(s) still reference it`,
      },
      { status: 409 },
    );
  }

  try {
    await prisma.category.delete({ where: { id } });
  } catch (error: unknown) {
    // Defensive fallback for the race where a transaction/budget is
    // created between the count check above and this delete.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2003"
    ) {
      return NextResponse.json(
        { error: "Cannot delete category: it is still referenced by other records" },
        { status: 409 },
      );
    }
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}
