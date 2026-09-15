import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Standalone script — Next.js loads .env.local automatically, but a
// plain `node`/`tsx` invocation doesn't, so parse it ourselves.
function loadEnvLocal() {
  const envPath = join(__dirname, "..", ".env.local");
  const contents = readFileSync(envPath, "utf-8");
  for (const line of contents.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

const DEMO_EMAIL = "adhithya.ragavan07@gmail.com";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type CategoryName = "Food" | "Transport" | "Rent" | "Entertainment" | "Income";

const CATEGORY_NAMES: CategoryName[] = [
  "Food",
  "Transport",
  "Rent",
  "Entertainment",
  "Income",
];

const TRANSACTIONS: {
  date: string;
  category: CategoryName;
  type: "income" | "expense";
  amount: number;
  note: string;
}[] = [
  { date: "2026-07-03", category: "Rent", type: "expense", amount: 1200.0, note: "July rent" },
  { date: "2026-07-12", category: "Food", type: "expense", amount: 54.2, note: "Groceries" },
  { date: "2026-07-20", category: "Transport", type: "expense", amount: 38.0, note: "Gas" },
  { date: "2026-07-30", category: "Income", type: "income", amount: 2500.0, note: "Paycheck" },
  { date: "2026-08-01", category: "Rent", type: "expense", amount: 1200.0, note: "August rent" },
  { date: "2026-08-08", category: "Entertainment", type: "expense", amount: 62.5, note: "Movie night" },
  { date: "2026-08-28", category: "Income", type: "income", amount: 2500.0, note: "Paycheck" },
  { date: "2026-09-01", category: "Rent", type: "expense", amount: 1200.0, note: "September rent" },
  { date: "2026-09-05", category: "Food", type: "expense", amount: 95.0, note: "Groceries" },
  { date: "2026-09-12", category: "Food", type: "expense", amount: 110.0, note: "Dinner out" },
];

const BUDGETS: { category: CategoryName; monthlyLimit: number }[] = [
  { category: "Food", monthlyLimit: 200 },
  { category: "Rent", monthlyLimit: 1300 },
  { category: "Entertainment", monthlyLimit: 100 },
];

async function main() {
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    throw new Error(
      `No user found with email ${DEMO_EMAIL}. Sign up for this account in the app first, then re-run this script.`
    );
  }

  console.log(`Seeding demo data for user ${user.id} (${user.email})`);

  // Wipe this user's existing data only, in FK-safe order.
  const deletedTransactions = await prisma.transaction.deleteMany({ where: { userId: user.id } });
  const deletedBudgets = await prisma.budget.deleteMany({ where: { userId: user.id } });
  const deletedCategories = await prisma.category.deleteMany({ where: { userId: user.id } });
  console.log(
    `Cleared existing data: ${deletedTransactions.count} transactions, ${deletedBudgets.count} budgets, ${deletedCategories.count} categories`
  );

  const categoryIdByName = new Map<CategoryName, string>();
  for (const name of CATEGORY_NAMES) {
    const category = await prisma.category.create({ data: { name, userId: user.id } });
    categoryIdByName.set(name, category.id);
  }
  console.log(`Created ${categoryIdByName.size} categories`);

  for (const tx of TRANSACTIONS) {
    await prisma.transaction.create({
      data: {
        amount: tx.amount,
        type: tx.type,
        note: tx.note,
        date: new Date(`${tx.date}T12:00:00.000Z`),
        userId: user.id,
        categoryId: categoryIdByName.get(tx.category)!,
      },
    });
  }
  console.log(`Created ${TRANSACTIONS.length} transactions`);

  for (const budget of BUDGETS) {
    await prisma.budget.create({
      data: {
        monthlyLimit: budget.monthlyLimit,
        userId: user.id,
        categoryId: categoryIdByName.get(budget.category)!,
      },
    });
  }
  console.log(`Created ${BUDGETS.length} budgets`);

  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const septemberSpendByCategory = new Map<CategoryName, number>();
  for (const tx of TRANSACTIONS) {
    const txDate = new Date(`${tx.date}T12:00:00.000Z`);
    if (tx.type === "expense" && txDate >= currentMonthStart) {
      septemberSpendByCategory.set(
        tx.category,
        (septemberSpendByCategory.get(tx.category) ?? 0) + tx.amount
      );
    }
  }

  console.log("\nCurrent-month spend vs. budget:");
  for (const budget of BUDGETS) {
    const spend = septemberSpendByCategory.get(budget.category) ?? 0;
    const status = spend > budget.monthlyLimit ? "OVER" : spend >= budget.monthlyLimit * 0.8 ? "close" : "under";
    console.log(
      `  ${budget.category}: $${spend.toFixed(2)} / $${budget.monthlyLimit.toFixed(2)} (${status})`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
