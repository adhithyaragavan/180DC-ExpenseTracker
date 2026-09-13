import { prisma } from "@/lib/prisma";

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

export function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function sumFor(
  groups: { type: string; _sum: { amount: number | null } }[],
  type: "income" | "expense",
) {
  return groups.find((g) => g.type === type)?._sum.amount ?? 0;
}

export async function getCurrentMonthCategorySpend(userId: string) {
  const monthStart = startOfUtcMonth(new Date());
  const grouped = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { userId, type: "expense", date: { gte: monthStart } },
    _sum: { amount: true },
  });
  return new Map(grouped.map((g) => [g.categoryId, g._sum.amount ?? 0]));
}

export async function getBudgetStatus(userId: string) {
  const [spendByCategoryId, budgets] = await Promise.all([
    getCurrentMonthCategorySpend(userId),
    prisma.budget.findMany({ where: { userId }, include: { category: true } }),
  ]);

  return budgets.map((budget) => {
    const spent = spendByCategoryId.get(budget.categoryId) ?? 0;
    return {
      categoryId: budget.categoryId,
      category: budget.category.name,
      monthlyLimit: budget.monthlyLimit,
      spent,
      remaining: budget.monthlyLimit - spent,
      overBudget: spent > budget.monthlyLimit,
    };
  });
}

export async function getSpendingSummary(userId: string) {
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
    getBudgetStatus(userId),
    prisma.$queryRaw<{ month: Date; total: number }[]>`
      SELECT date_trunc('month', "date") AS month, SUM("amount") AS total
      FROM "Transaction"
      WHERE "userId" = ${userId} AND "type" = 'expense' AND "date" >= ${sixMonthsAgo}
      GROUP BY month
      ORDER BY month ASC
    `,
  ]);

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

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

  return {
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
    budgets,
  };
}
