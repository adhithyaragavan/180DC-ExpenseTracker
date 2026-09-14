# Expense Tracker

## 1. Overview

A personal expense tracker with email/password authentication, per-user transaction/category/budget management, a spending dashboard (category breakdown, 6-month trend, budget-vs-actual), a linear-extrapolation spending forecast, and an AI chat assistant (Groq, `openai/gpt-oss-120b`) that can query and modify a user's own data through a fixed set of server-side tool functions — never through raw database or SQL access, and never using an id the model or client supplies.

## 2. Setup

```bash
git clone <repo-url>
cd 180DC-ExpenseTracker
npm install
```

`npm install` runs `prisma generate` automatically via the `postinstall` script — this regenerates the Prisma Client into `src/generated/prisma`, which is gitignored and must exist before anything else will build.

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (Prisma's datasource). This project was built and deployed against a hosted Neon Postgres instance. |
| `AUTH_SECRET` | Signs/encrypts Auth.js (NextAuth v5) session JWTs. Generate one with `openssl rand -base64 32`. Rotating it invalidates all existing sessions. |
| `GROQ_API_KEY` | Authenticates the AI chat assistant against Groq's OpenAI-compatible API (`https://api.groq.com/openai/v1`). Get one at console.groq.com. |

Run migrations against your database:

```bash
npx prisma migrate dev
```

Run the app locally:

```bash
npm run dev
```

Visit `http://localhost:3000`, sign up at `/signup`, then use the app from `/dashboard`.

## 3. Architecture

Next.js App Router (TypeScript), Tailwind for styling, Prisma over Postgres, Auth.js v5 (Credentials provider) for sessions, Groq for the chat model.

- **`src/app/(app)/`** — a route group (doesn't affect URLs) holding every page that requires a session: `dashboard/`, `transactions/`, `categories/`, `budgets/`. `src/app/(app)/layout.tsx` renders the persistent `Navbar` (`src/app/components/Navbar.tsx`) around all of them. Each page is a small Server Component that calls `auth()` and `redirect("/login")` if there's no session, then hands off to a `"use client"` component (e.g. `TransactionsClient.tsx`) that fetches from the matching API route and renders the list/form/table.
- **`src/app/login/`, `src/app/signup/`** — outside the `(app)` group, so they never render the navbar.
- **`src/app/api/`** — one route file per resource, each calling `auth()` first and scoping every Prisma query to `session.user.id` (see §6). Routes: `auth/[...nextauth]`, `auth/signup`, `transactions`, `transactions/[id]`, `categories`, `categories/[id]`, `budgets`, `budgets/[id]`, `summary`, `forecast`, `chat`.
- **`src/lib/auth.ts`** — the Auth.js v5 config (Credentials provider, JWT session strategy, `bcrypt.compare` in `authorize`). Exports `auth()`, which every API route and server component uses as the single source of truth for the current user.
- **`src/lib/prisma.ts`** — the Prisma Client singleton, constructed with the `@prisma/adapter-pg` driver adapter (Prisma 7's `prisma-client` generator requires an explicit adapter; it doesn't read `DATABASE_URL` on its own at runtime the way older Prisma versions did).
- **`src/lib/summary.ts`** — shared aggregation logic (`getBudgetStatus`, `getSpendingSummary`, `getCurrentMonthCategorySpend`) used by both `src/app/api/summary/route.ts` and the AI tools, so the numbers shown on the dashboard and the numbers the assistant reports are computed by the same code, not duplicated.
- **`src/lib/forecast.ts`**, **`src/lib/ai-tools/recommendations.ts`** — the two "computed insight" features (§5, §7).
- **`src/lib/ai-tools/tools.ts`** — the AI assistant's entire capability surface (§5).
- Postgres access always goes through Prisma; the chat route talks to Groq via the `openai` npm SDK pointed at `baseURL: "https://api.groq.com/openai/v1"`.

## 4. Database schema

From `prisma/schema.prisma`, four models:

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  categories   Category[]
  transactions Transaction[]
  budgets      Budget[]
}

model Category {
  id           String   @id @default(cuid())
  name         String
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  transactions Transaction[]
  budgets      Budget[]
}

model Transaction {
  id         String   @id @default(cuid())
  amount     Float
  type       String   // "income" or "expense"
  note       String?
  date       DateTime @default(now())
  userId     String
  categoryId String
  user       User     @relation(fields: [userId], references: [id])
  category   Category @relation(fields: [categoryId], references: [id])
}

model Budget {
  id            String   @id @default(cuid())
  monthlyLimit  Float
  userId        String
  categoryId    String
  user          User     @relation(fields: [userId], references: [id])
  category      Category @relation(fields: [categoryId], references: [id])
}
```

`User` is the root of ownership: every `Category`, `Transaction`, and `Budget` row carries its own `userId` foreign key. `Transaction` and `Budget` additionally reference `Category` by `categoryId` — a relation that is *not* itself scoped by user (see §6 for how that gap is closed at the application layer). Both `categoryId` foreign keys are `ON DELETE RESTRICT` at the database level, which is what makes the category-delete behavior in §6 necessary rather than optional.

## 5. AI / Tool architecture

The assistant (`src/app/api/chat/route.ts`) has exactly five tools, defined in `src/lib/ai-tools/tools.ts`. Their JSON-schema parameters, verbatim:

- **`getTransactions(limit?, type?, category?)`** — `limit`: integer, clamped server-side to 1–50 (default 10) regardless of what's requested; `type`: `"income" | "expense"`; `category`: category name, matched case-insensitively. Returns the user's transactions (`orderBy: date desc`, `include: category`).
- **`getSpendingSummary()`** — no parameters. Returns all-time and current-month income/expense totals, current-month spend by category, a 6-month trend, budget status, and a `recommendations` array (see below). This tool literally calls the same `getSpendingSummary` function from `src/lib/summary.ts` that `/api/summary` uses — the dashboard and the assistant report identical numbers because they run identical code.
- **`addTransaction(amount, type, category, note?)`** — `amount`: positive number (required); `type`: `"income" | "expense"` (required); `category`: name string (required); `note`: optional string. If no category with that name (case-insensitive) exists yet for the user, one is created automatically before the transaction is written.
- **`getBudgetStatus()`** — no parameters. Current-month spend vs. `monthlyLimit` for every category that has a budget.
- **`getSpendingForecast()`** — no parameters. See §7.

**None of these five parameter schemas include a `userId` field.** That's deliberate, not an oversight — the model is never told such a parameter exists, so it has no schema-sanctioned way to try to supply one.

**The enforcement point** is in `src/app/api/chat/route.ts`. The route calls `auth()` first (401 if no session, same as every other route) and filters the client-supplied conversation history down to `role: "user"`/`"assistant"` messages only (a client can't inject a fake `system` or `tool` message — those are only ever constructed server-side). It then loops, calling Groq's `chat.completions.create` with the tool definitions; when a response includes `tool_calls`, each call's `arguments` string is `JSON.parse`d and dispatched by name through `TOOL_HANDLERS` (a `Record<string, (userId: string, args: unknown) => Promise<unknown>>`):

```ts
result = await handler(session.user.id, parsedArgs);
```

`session.user.id` — read from the server-side decrypted session, never from `parsedArgs` — is the *only* value ever passed as the handler's `userId` argument. Even if the model hallucinated a `userId` field inside its tool-call JSON, no handler signature reads one out of its arguments object; it simply isn't a field any handler looks at. This was verified directly: a tool call was sent with `{"userId": "some-other-users-id", ...}` smuggled into its arguments, and the result was still scoped entirely to the real session user (see §8).

The loop is bounded at 5 round-trips (`MAX_TOOL_ROUNDTRIPS`) to prevent a runaway tool-calling loop, and every handler call is wrapped in a `try/catch` — a thrown validation error (e.g. `addTransaction` given a negative amount) becomes a `{"error": "..."}` tool-result message sent back to the model, not an unhandled 500, so the assistant can see the failure and react instead of the request just breaking.

**Proactive recommendations methodology** (`src/lib/ai-tools/recommendations.ts`, surfaced inside `getSpendingSummary`'s response): for each category, compute the average monthly spend over the prior 3 full months (`avg3mo`). If the current month's spend exceeds `avg3mo * 1.25` (more than 25% above that average), flag it with `percentOverAverage` and a `savingsTarget` equal to `currentMonthSpend - avg3mo` — the amount that would need to be cut to return to the recent average. The system prompt explicitly instructs the model to report only this pre-computed data, not invent its own spending analysis.

## 6. Security / authorization model

Every API route follows the same shape: `auth()` first, `401` if there's no session, and every Prisma query filtered by `session.user.id` — never a `userId` read from the request body, query string, or a tool call's arguments.

**The ownership-check pattern** used by every `PATCH`/`DELETE` route addressing a resource by id (`transactions/[id]`, `categories/[id]`, `budgets/[id]`): a `getOwned*` helper does a plain `findUnique({ where: { id } })`, then compares `.userId === session.user.id` in application code, rather than folding the ownership check into the `where` clause (`findFirst({ where: { id, userId } })`). The reason is deliberate: `findFirst` with both conditions would return `null` for "doesn't exist" and "exists but belongs to someone else" indistinguishably at the database level, but the *comparison-in-code* version makes that same collapse an explicit, auditable step rather than an implicit one — and it's what lets every such route return exactly **404** for both cases, never **403**. A 403 confirms a resource exists but access is denied — which leaks the existence of other users' ids to anyone probing sequential or guessed values. 404 is indistinguishable from "no such id at all," leaking nothing.

**The category-ownership check on `Transaction`/`Budget` writes**: `Transaction.categoryId` and `Budget.categoryId` are real foreign keys, but a foreign key only proves the referenced `Category` row *exists* — it says nothing about who owns it. Both `POST /api/transactions` and `POST /api/budgets` (and the `PATCH` routes, when `categoryId` is being changed) explicitly `findUnique` the category and check `category.userId === session.user.id` before writing, returning **400** if it fails. Without this check, a user could attach a transaction or budget to another user's category id and it would succeed at the database level — the FK doesn't care whose category it is, only that the category exists.

**Status code conventions, applied consistently across every route:**
- `401` — no session.
- `400` — validation failure (bad `amount`/`type`/`name`/etc.), *and* the categoryId-ownership failure above (treated as invalid input to a create/update, not a resource lookup).
- `404` — a `PATCH`/`DELETE` target doesn't exist or isn't owned by the caller (see above).
- `409` — `DELETE /api/categories/[id]` when the category still has dependent rows (below).
- `201` — successful creation; `204` — successful deletion; `200` — successful read/update.

**Delete-with-dependents on categories**: both category-referencing foreign keys are `ON DELETE RESTRICT` at the database level, so Postgres will already refuse to delete a `Category` that still has `Transaction` or `Budget` rows pointing at it. Rather than let that surface as an unhandled database error, `DELETE /api/categories/[id]` proactively counts referencing transactions and budgets and, if either is nonzero, returns `409` with a message naming both counts (e.g. `"Cannot delete category: 3 transaction(s) and 1 budget(s) still reference it"`) without attempting the delete. This was a deliberate choice against cascading: silently deleting a user's transaction history as a side effect of removing a category is the wrong default for financial data. The actual `delete` call is additionally wrapped in a `try/catch` for Prisma's `P2003` (foreign key violation) as a defensive fallback for the race between the count check and the delete, returning the same 409 rather than a raw error.

**Passwords**: hashed with `bcrypt` (cost factor 12) in `src/app/api/auth/signup/route.ts` before ever touching the database; the plaintext is never logged or stored. `authorize()` in `src/lib/auth.ts` re-derives and compares via `bcrypt.compare`, returning `null` (not a differentiated error) on any failure — wrong password and nonexistent email look identical to the caller.

## 7. Product Innovation: Spending Forecast

`src/lib/forecast.ts`, exposed as `GET /api/forecast` and the `getSpendingForecast` AI tool, and rendered as a card on the dashboard.

**Methodology, stated exactly as implemented**: linear extrapolation from the current days-elapsed pace.

```
daysElapsed          = current UTC day-of-month
daysInMonth          = total days in the current UTC month
currentSpend          = sum of this month's expenses so far
projectedMonthEndSpend = (currentSpend / daysElapsed) * daysInMonth
```

The same formula is applied per category for any category with a budget set, producing `projectedSpend` and `projectedOverage = max(0, projectedSpend - monthlyLimit)` for categories on track to exceed their limit by month-end.

**Stated limitations** (also called out directly in the code comment and the assistant's system prompt, rather than left implicit):
- **Early-month noise**: on day 2 of the month, one $200 purchase projects to `(200/2)*30 = $3000` for the month. The method has no way to distinguish a genuine daily pace from a single early transaction until enough days have accumulated.
- **Lump-sum expenses get smeared evenly**: rent paid in full on the 1st, or an annual subscription, looks identical to the model as "this category spends at a steady daily rate" — the projection assumes that payment recurs daily for the rest of the month.
- **No memory of prior months' actual shape**: no seasonality, no awareness of a user's typical front-loaded or back-loaded spending pattern — the method always assumes the rest of the month looks like today's average.

It's a defensible default specifically *because* it's transparent and auditable by hand — appropriate for a finance tool where an opaque model would be harder to trust — but it is explicitly presented (in the UI copy, the API consumer, and the assistant's own responses) as an estimate, not a prediction.

## 8. AI coding tools used

This project was built with Claude Code throughout development. `CLAUDE.md`, written at the start of the project, established the five security-critical constraints up front — server-side-only authorization, per-user query scoping, a fixed AI tool surface with no raw database access, session-derived (never model-supplied) ids in every tool call, and secrets confined to `.env.local` — and every subsequent feature was built against those constraints rather than having them retrofitted.

I made the architectural decisions at each step (e.g., choosing Auth.js v5 over the still-current-but-legacy v4 line, pinning Prisma to the last stable major rather than the in-progress v8 release candidate, the `findUnique`-then-compare ownership pattern over a combined `findFirst` query, blocking rather than cascading category deletes, the specific recommendation/forecast methodologies), reviewed every security-sensitive piece of generated code, and ran manual verification at each stage rather than assuming correctness — including, specifically for the AI assistant, deliberately sending a tool call with a smuggled `userId` field in its arguments and confirming the result was still scoped entirely to the real authenticated user, with zero effect from the injected value.

## 9. Test credentials

A demo account exists on the deployed instance:

- **Email**: `demo@example.com`
- **Password**: `demo12345`

## 10. Live URL

https://180-dc-expense-tracker.vercel.app
