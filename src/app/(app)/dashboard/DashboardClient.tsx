"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Summary = {
  totals: {
    allTime: { income: number; expense: number };
    currentMonth: { income: number; expense: number };
  };
  categorySpending: { categoryId: string; category: string; total: number }[];
  monthlyTrend: { month: string; label: string; total: number }[];
  budgets: {
    categoryId: string;
    category: string;
    monthlyLimit: number;
    spent: number;
    remaining: number;
    overBudget: boolean;
  }[];
};

type Forecast = {
  daysElapsed: number;
  daysRemaining: number;
  currentSpend: number;
  projectedMonthEndSpend: number;
  categoryForecasts: {
    categoryId: string;
    category: string;
    currentSpend: number;
    projectedSpend: number;
    monthlyLimit: number;
    projectedOverage: number;
  }[];
};

export function DashboardClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);

  useEffect(() => {
    fetch("/api/summary")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load dashboard data");
        return res.json();
      })
      .then(setSummary)
      .catch((err) => setError(err.message));

    // Independent of the summary fetch — the forecast card shouldn't
    // block on or couple to the chart data.
    fetch("/api/forecast")
      .then((res) => (res.ok ? res.json() : null))
      .then(setForecast)
      .catch(() => {});
  }, []);

  if (error) {
    return <main className="p-8 text-red-600">{error}</main>;
  }

  if (!summary) {
    return <main className="p-8">Loading...</main>;
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="This month income" value={summary.totals.currentMonth.income} />
        <StatTile label="This month expense" value={summary.totals.currentMonth.expense} />
        <StatTile label="All-time income" value={summary.totals.allTime.income} />
        <StatTile label="All-time expense" value={summary.totals.allTime.expense} />
      </section>

      {forecast && (
        <section className="rounded border p-4">
          <h2 className="mb-2 text-lg font-medium">Spending forecast</h2>
          <p className="text-sm text-zinc-700">
            At this pace, you&apos;re on track to spend{" "}
            <span className="font-semibold">
              ${forecast.projectedMonthEndSpend.toFixed(2)}
            </span>{" "}
            by month-end ({forecast.daysElapsed} day
            {forecast.daysElapsed === 1 ? "" : "s"} in, {forecast.daysRemaining}{" "}
            remaining). Based on ${forecast.currentSpend.toFixed(2)} spent so far —
            a simple linear projection, not a guarantee.
          </p>
          {forecast.categoryForecasts.some((c) => c.projectedOverage > 0) && (
            <ul className="mt-3 flex flex-col gap-1">
              {forecast.categoryForecasts
                .filter((c) => c.projectedOverage > 0)
                .map((c) => (
                  <li
                    key={c.categoryId}
                    className="flex items-center justify-between rounded bg-red-50 px-2 py-1 text-sm"
                  >
                    <span className="font-medium text-red-700">{c.category}</span>
                    <span className="text-red-700">
                      projected ${c.projectedSpend.toFixed(2)} / $
                      {c.monthlyLimit.toFixed(2)} limit (+$
                      {c.projectedOverage.toFixed(2)})
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Spending by category (this month)</h2>
        {summary.categorySpending.length === 0 ? (
          <p className="text-sm text-zinc-500">No expenses recorded this month.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={summary.categorySpending}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Spending trend (last 6 months)</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={summary.monthlyTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Budgets vs. actual (this month)</h2>
        {summary.budgets.length === 0 ? (
          <p className="text-sm text-zinc-500">No budgets set yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {summary.budgets.map((budget) => {
              const percent = Math.min(
                (budget.spent / budget.monthlyLimit) * 100,
                100,
              );
              return (
                <li key={budget.categoryId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {budget.category}
                      {budget.overBudget && (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                          Over budget
                        </span>
                      )}
                    </span>
                    <span className="text-zinc-500">
                      {budget.spent.toFixed(2)} / {budget.monthlyLimit.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-zinc-200">
                    <div
                      className={`h-full ${budget.overBudget ? "bg-red-500" : "bg-blue-500"}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold">{value.toFixed(2)}</div>
    </div>
  );
}
