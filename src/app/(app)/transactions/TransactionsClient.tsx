"use client";

import { useEffect, useState } from "react";

type Category = { id: string; name: string };
type Transaction = {
  id: string;
  amount: number;
  type: "income" | "expense";
  note: string | null;
  date: string;
  categoryId: string;
  category: Category;
};

type FormState = {
  amount: string;
  type: "income" | "expense";
  categoryId: string;
  note: string;
  date: string;
};

const EMPTY_FORM: FormState = {
  amount: "",
  type: "expense",
  categoryId: "",
  note: "",
  date: "",
};

function toPayload(form: FormState) {
  return {
    amount: Number(form.amount),
    type: form.type,
    categoryId: form.categoryId,
    note: form.note.trim() ? form.note.trim() : undefined,
    date: form.date ? form.date : undefined,
  };
}

export function TransactionsClient() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/transactions").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ])
      .then(([txns, cats]) => {
        setTransactions(txns);
        setCategories(cats);
      })
      .catch(() => setLoadError("Failed to load transactions"));
  }, []);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(form)),
    });
    const body = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setFormError(body.error);
      return;
    }

    setTransactions((prev) => (prev ? [body, ...prev] : [body]));
    setForm(EMPTY_FORM);
  }

  function startEdit(txn: Transaction) {
    setEditingId(txn.id);
    setEditError(null);
    setEditForm({
      amount: String(txn.amount),
      type: txn.type,
      categoryId: txn.categoryId,
      note: txn.note ?? "",
      date: txn.date.slice(0, 10),
    });
  }

  async function saveEdit(id: string) {
    setEditError(null);

    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(editForm)),
    });
    const body = await res.json();

    if (!res.ok) {
      setEditError(body.error);
      return;
    }

    setTransactions((prev) =>
      prev ? prev.map((t) => (t.id === id ? body : t)) : prev,
    );
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this transaction?")) return;

    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTransactions((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
    }
  }

  if (loadError) {
    return <main className="p-8 text-red-600">{loadError}</main>;
  }
  if (!transactions) {
    return <main className="p-8">Loading...</main>;
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Transactions</h1>

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 rounded border p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Amount</label>
          <input
            type="number"
            step="0.01"
            required
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="w-28 rounded border px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Type</label>
          <select
            value={form.type}
            onChange={(e) =>
              setForm({ ...form, type: e.target.value as "income" | "expense" })
            }
            className="rounded border px-2 py-1.5 text-sm"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Category</label>
          <select
            required
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="rounded border px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              Select...
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Note</label>
          <input
            type="text"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="rounded border px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="rounded border px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || categories.length === 0}
          className="rounded bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Add
        </button>
        {categories.length === 0 && (
          <p className="text-xs text-zinc-500">Add a category first.</p>
        )}
      </form>
      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-zinc-500">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Category</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Note</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((txn) =>
              editingId === txn.id ? (
                <tr key={txn.id} className="border-b">
                  <td className="py-2 pr-4">
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) =>
                        setEditForm({ ...editForm, date: e.target.value })
                      }
                      className="rounded border px-1.5 py-1 text-sm"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={editForm.categoryId}
                      onChange={(e) =>
                        setEditForm({ ...editForm, categoryId: e.target.value })
                      }
                      className="rounded border px-1.5 py-1 text-sm"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={editForm.type}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          type: e.target.value as "income" | "expense",
                        })
                      }
                      className="rounded border px-1.5 py-1 text-sm"
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.amount}
                      onChange={(e) =>
                        setEditForm({ ...editForm, amount: e.target.value })
                      }
                      className="w-24 rounded border px-1.5 py-1 text-sm"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="text"
                      value={editForm.note}
                      onChange={(e) =>
                        setEditForm({ ...editForm, note: e.target.value })
                      }
                      className="rounded border px-1.5 py-1 text-sm"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(txn.id)}
                          className="rounded bg-black px-2 py-1 text-xs text-white"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                      {editError && (
                        <p className="text-xs text-red-600">{editError}</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={txn.id} className="border-b">
                  <td className="py-2 pr-4">{txn.date.slice(0, 10)}</td>
                  <td className="py-2 pr-4">{txn.category.name}</td>
                  <td className="py-2 pr-4 capitalize">{txn.type}</td>
                  <td className="py-2 pr-4">{txn.amount.toFixed(2)}</td>
                  <td className="py-2 pr-4">{txn.note}</td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(txn)}
                        className="rounded border px-2 py-1 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(txn.id)}
                        className="rounded border px-2 py-1 text-xs text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-zinc-500">
                  No transactions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
