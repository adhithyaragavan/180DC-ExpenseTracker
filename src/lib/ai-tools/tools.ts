import type { ChatCompletionTool } from "openai/resources/chat/completions";

import { prisma } from "@/lib/prisma";
import {
  getBudgetStatus as computeBudgetStatus,
  getSpendingSummary as computeSpendingSummary,
} from "@/lib/summary";
import { getSpendingRecommendations } from "@/lib/ai-tools/recommendations";

// Tool parameter schemas deliberately have no `userId` field — the model
// has no schema-sanctioned way to supply one. Every handler below takes
// `userId` as its own first argument, always `session.user.id` from the
// route, and never reads an id out of `args`.

export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "getTransactions",
      description:
        "Get the user's recent transactions, optionally filtered by type or category name.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Max number of transactions to return (default 10, max 50)",
          },
          type: {
            type: "string",
            enum: ["income", "expense"],
            description: "Filter by transaction type",
          },
          category: {
            type: "string",
            description: "Filter by category name (case-insensitive)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getSpendingSummary",
      description:
        "Get an overview of the user's spending: all-time and current-month totals, current-month spending by category, a 6-month spending trend, budget status, and proactive recommendations for categories where spending has spiked relative to recent history.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "addTransaction",
      description:
        "Record a new transaction for the user. If the named category doesn't exist yet, it is created automatically.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Positive transaction amount" },
          type: { type: "string", enum: ["income", "expense"] },
          category: {
            type: "string",
            description: "Category name (created automatically if new)",
          },
          note: { type: "string", description: "Optional note" },
        },
        required: ["amount", "type", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBudgetStatus",
      description:
        "Get the user's current-month spend vs. budget for each category that has a budget set.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

function asArgs(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null
    ? (args as Record<string, unknown>)
    : {};
}

async function getTransactions(userId: string, rawArgs: unknown) {
  const args = asArgs(rawArgs);

  let limit = 10;
  if (typeof args.limit === "number" && Number.isFinite(args.limit)) {
    limit = Math.min(50, Math.max(1, Math.trunc(args.limit)));
  }

  let type: "income" | "expense" | undefined;
  if (args.type !== undefined) {
    if (args.type !== "income" && args.type !== "expense") {
      throw new Error('type must be "income" or "expense"');
    }
    type = args.type;
  }

  let categoryId: string | undefined;
  if (typeof args.category === "string" && args.category.trim().length > 0) {
    const category = await prisma.category.findFirst({
      where: { userId, name: { equals: args.category, mode: "insensitive" } },
    });
    if (!category) {
      return [];
    }
    categoryId = category.id;
  }

  return prisma.transaction.findMany({
    where: {
      userId,
      ...(type ? { type } : {}),
      ...(categoryId ? { categoryId } : {}),
    },
    orderBy: { date: "desc" },
    take: limit,
    include: { category: true },
  });
}

async function getSpendingSummary(userId: string) {
  const [summary, recommendations] = await Promise.all([
    computeSpendingSummary(userId),
    getSpendingRecommendations(userId),
  ]);
  return { ...summary, recommendations };
}

async function addTransaction(userId: string, rawArgs: unknown) {
  const args = asArgs(rawArgs);

  const amount = args.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be a positive number");
  }

  const type = args.type;
  if (type !== "income" && type !== "expense") {
    throw new Error('type must be "income" or "expense"');
  }

  const categoryName = args.category;
  if (typeof categoryName !== "string" || categoryName.trim().length === 0) {
    throw new Error("category is required");
  }

  const note = typeof args.note === "string" ? args.note : null;

  let category = await prisma.category.findFirst({
    where: { userId, name: { equals: categoryName, mode: "insensitive" } },
  });
  if (!category) {
    category = await prisma.category.create({
      data: { name: categoryName, userId },
    });
  }

  return prisma.transaction.create({
    data: { amount, type, note, userId, categoryId: category.id },
    include: { category: true },
  });
}

async function getBudgetStatus(userId: string) {
  return computeBudgetStatus(userId);
}

export const TOOL_HANDLERS: Record<
  string,
  (userId: string, args: unknown) => Promise<unknown>
> = {
  getTransactions,
  getSpendingSummary,
  addTransaction,
  getBudgetStatus,
};
