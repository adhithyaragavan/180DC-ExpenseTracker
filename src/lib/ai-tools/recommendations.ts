import { prisma } from "@/lib/prisma";
import { getCurrentMonthCategorySpend, startOfUtcMonth } from "@/lib/summary";

const SPIKE_THRESHOLD = 1.25;

/**
 * Flags categories where this month's spend is more than 25% above the
 * average of the prior 3 full months, with a savings target that would
 * bring spend back down to that average. This is the exact, fixed
 * methodology behind the assistant's "proactive recommendations" — the
 * model reports these numbers, it doesn't invent them.
 */
export async function getSpendingRecommendations(userId: string) {
  const monthStart = startOfUtcMonth(new Date());
  const priorPeriodStart = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 3, 1),
  );

  const [currentSpendByCategoryId, priorPeriodGrouped, categories] =
    await Promise.all([
      getCurrentMonthCategorySpend(userId),
      prisma.transaction.groupBy({
        by: ["categoryId"],
        where: {
          userId,
          type: "expense",
          date: { gte: priorPeriodStart, lt: monthStart },
        },
        _sum: { amount: true },
      }),
      prisma.category.findMany({ where: { userId } }),
    ]);

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const recommendations: {
    categoryId: string;
    category: string;
    currentMonthSpend: number;
    avg3mo: number;
    percentOverAverage: number;
    savingsTarget: number;
  }[] = [];

  for (const row of priorPeriodGrouped) {
    const avg3mo = (row._sum.amount ?? 0) / 3;
    const currentMonthSpend = currentSpendByCategoryId.get(row.categoryId) ?? 0;

    if (avg3mo > 0 && currentMonthSpend > avg3mo * SPIKE_THRESHOLD) {
      recommendations.push({
        categoryId: row.categoryId,
        category: categoryNameById.get(row.categoryId) ?? "Unknown",
        currentMonthSpend,
        avg3mo,
        percentOverAverage: ((currentMonthSpend - avg3mo) / avg3mo) * 100,
        savingsTarget: currentMonthSpend - avg3mo,
      });
    }
  }

  return recommendations;
}
