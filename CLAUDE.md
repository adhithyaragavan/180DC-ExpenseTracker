@AGENTS.md

# Expense Tracker — Project Rules

This is a personal expense tracker with an AI assistant feature. The rules
below are security-critical and apply to all code in this repo, written by
a human or by Claude. Do not weaken, work around, or "temporarily" skip
any of these while iterating — ask first if a task seems to require it.

1. **All authorization checks happen server-side, in API routes.** Never
   trust the frontend to restrict access. Client-side checks (hiding a
   button, disabling a form) are UX only, never a security boundary.
   Enforcement lives in `src/app/api/**` route handlers.

2. **Every database query must be filtered by the currently authenticated
   user's id.** No query should ever be able to return another user's
   data. When adding a Prisma model that belongs to a user, always scope
   reads/writes with `where: { userId: session.user.id, ... }` (or the
   equivalent), never trust a `userId` from the request body/query string.

3. **The AI assistant only gets access to specific, pre-defined tool
   functions** (e.g. `getTransactions`, `addTransaction`). It never gets
   raw database or SQL access, and never gets a generic "run this query"
   escape hatch. Tool functions live in `src/lib/ai-tools/`.

4. **Every tool call the AI assistant makes must run using the currently
   authenticated user's id — never a user-suppliable id.** The id is
   resolved server-side from the session and passed into the tool
   function; it must never be read from the tool call's arguments, the
   request body, or anything else the client (or the model, via a
   crafted prompt) can influence.

5. **All secrets (API keys, database URL) go in `.env.local`** and are
   never committed or exposed to the client. `.env.local` is gitignored;
   `.env.example` documents the required variable names with empty
   values only. Never read a secret into a value that flows to a client
   component, a public API response, or a log.
