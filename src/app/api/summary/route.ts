import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function sumFor(
  groups: { type: string; _sum: { amount: number | null } }[],
  type: "income" | "expense",
) {
  return groups.find((g) => g.type === type)?._sum.amount ?? 0;
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = new Date();
  const monthStart = startOfUtcMonth(now);
  // 6 UTC month buckets ending with the current month.
  const sixMonthsAgo = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 5, 1),
  );

  const [
    allTimeByType,
    currentMonthByType,
    currentMonthByCategory,
    categories,
    budgets,
    monthlyTrendRaw,
  ] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["type"],
      where: { userId },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["type"],
      where: { userId, date: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, type: "expense", date: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.category.findMany({ where: { userId } }),
    prisma.budget.findMany({ where: { userId }, include: { category: true } }),
    prisma.$queryRaw<{ month: Date; total: number }[]>`
      SELECT date_trunc('month', "date") AS month, SUM("amount") AS total
      FROM "Transaction"
      WHERE "userId" = ${userId} AND "type" = 'expense' AND "date" >= ${sixMonthsAgo}
      GROUP BY month
      ORDER BY month ASC
    `,
  ]);

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const currentMonthSpendByCategoryId = new Map(
    currentMonthByCategory.map((g) => [g.categoryId, g._sum.amount ?? 0]),
  );

  const categorySpending = currentMonthByCategory.map((g) => ({
    categoryId: g.categoryId,
    category: categoryNameById.get(g.categoryId) ?? "Unknown",
    total: g._sum.amount ?? 0,
  }));

  const trendByMonthKey = new Map(
    monthlyTrendRaw.map((row) => [monthKey(new Date(row.month)), Number(row.total)]),
  );
  const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(
      Date.UTC(sixMonthsAgo.getUTCFullYear(), sixMonthsAgo.getUTCMonth() + i, 1),
    );
    const key = monthKey(d);
    return {
      month: key,
      label: MONTH_LABEL.format(d),
      total: trendByMonthKey.get(key) ?? 0,
    };
  });

  const budgetSummaries = budgets.map((budget) => {
    const spent = currentMonthSpendByCategoryId.get(budget.categoryId) ?? 0;
    return {
      categoryId: budget.categoryId,
      category: budget.category.name,
      monthlyLimit: budget.monthlyLimit,
      spent,
      remaining: budget.monthlyLimit - spent,
      overBudget: spent > budget.monthlyLimit,
    };
  });

  return NextResponse.json({
    totals: {
      allTime: {
        income: sumFor(allTimeByType, "income"),
        expense: sumFor(allTimeByType, "expense"),
      },
      currentMonth: {
        income: sumFor(currentMonthByType, "income"),
        expense: sumFor(currentMonthByType, "expense"),
      },
    },
    categorySpending,
    monthlyTrend,
    budgets: budgetSummaries,
  });
}
