import { prisma } from "@/lib/prisma";
import { getCurrentMonthCategorySpend, startOfUtcMonth } from "@/lib/summary";

/**
 * Methodology: simple linear extrapolation from the current days-elapsed
 * spending pace — (spend so far / days elapsed) * days in month. This is
 * NOT a forecasting model: it has no seasonality, no awareness of
 * recurring/lump-sum expenses, and no historical weighting. It assumes
 * the rest of the month spends at the same average daily rate as it has
 * so far. Stated plainly here rather than implied precision the method
 * doesn't have.
 */
export async function getSpendingForecast(userId: string) {
  const now = new Date();
  const monthStart = startOfUtcMonth(now);
  const year = monthStart.getUTCFullYear();
  const month = monthStart.getUTCMonth();

  const daysElapsed = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const daysRemaining = daysInMonth - daysElapsed;

  const [spendByCategoryId, budgets] = await Promise.all([
    getCurrentMonthCategorySpend(userId),
    prisma.budget.findMany({ where: { userId }, include: { category: true } }),
  ]);

  const currentSpend = Array.from(spendByCategoryId.values()).reduce(
    (sum, v) => sum + v,
    0,
  );
  const projectedMonthEndSpend = (currentSpend / daysElapsed) * daysInMonth;

  const categoryForecasts = budgets.map((budget) => {
    const categorySpend = spendByCategoryId.get(budget.categoryId) ?? 0;
    const projectedSpend = (categorySpend / daysElapsed) * daysInMonth;
    return {
      categoryId: budget.categoryId,
      category: budget.category.name,
      currentSpend: categorySpend,
      projectedSpend,
      monthlyLimit: budget.monthlyLimit,
      projectedOverage: Math.max(0, projectedSpend - budget.monthlyLimit),
    };
  });

  return {
    daysElapsed,
    daysRemaining,
    currentSpend,
    projectedMonthEndSpend,
    categoryForecasts,
  };
}
