"use client";

import { useEffect, useState } from "react";

type Category = { id: string; name: string };
type Budget = {
  id: string;
  monthlyLimit: number;
  categoryId: string;
  category: Category;
};

export function BudgetsClient() {
  const [budgets, setBudgets] = useState<Budget[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState({ categoryId: "", monthlyLimit: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ categoryId: "", monthlyLimit: "" });
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/budgets").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ])
      .then(([bgts, cats]) => {
        setBudgets(bgts);
        setCategories(cats);
      })
      .catch(() => setLoadError("Failed to load budgets"));
  }, []);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const res = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: form.categoryId,
        monthlyLimit: Number(form.monthlyLimit),
      }),
    });
    const body = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setFormError(body.error);
      return;
    }

    setBudgets((prev) => (prev ? [...prev, body] : [body]));
    setForm({ categoryId: "", monthlyLimit: "" });
  }

  function startEdit(budget: Budget) {
    setEditingId(budget.id);
    setEditForm({
      categoryId: budget.categoryId,
      monthlyLimit: String(budget.monthlyLimit),
    });
    setEditError(null);
  }

  async function saveEdit(id: string) {
    setEditError(null);

    const res = await fetch(`/api/budgets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: editForm.categoryId,
        monthlyLimit: Number(editForm.monthlyLimit),
      }),
    });
    const body = await res.json();

    if (!res.ok) {
      setEditError(body.error);
      return;
    }

    setBudgets((prev) => (prev ? prev.map((b) => (b.id === id ? body : b)) : prev));
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this budget?")) return;

    const res = await fetch(`/api/budgets/${id}`, { method: "DELETE" });
    if (res.ok) {
      setBudgets((prev) => (prev ? prev.filter((b) => b.id !== id) : prev));
    }
  }

  if (loadError) {
    return <main className="p-8 text-red-600">{loadError}</main>;
  }
  if (!budgets) {
    return <main className="p-8">Loading...</main>;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Budgets</h1>

      <form onSubmit={handleAdd} className="flex items-end gap-2 rounded border p-4">
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
          <label className="text-xs text-zinc-500">Monthly limit</label>
          <input
            type="number"
            step="0.01"
            required
            value={form.monthlyLimit}
            onChange={(e) => setForm({ ...form, monthlyLimit: e.target.value })}
            className="w-32 rounded border px-2 py-1.5 text-sm"
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

      <ul className="flex flex-col gap-2">
        {budgets.map((budget) => (
          <li key={budget.id} className="flex flex-col gap-1 rounded border p-3">
            {editingId === budget.id ? (
              <div className="flex items-center gap-2">
                <select
                  value={editForm.categoryId}
                  onChange={(e) =>
                    setEditForm({ ...editForm, categoryId: e.target.value })
                  }
                  className="rounded border px-2 py-1 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.monthlyLimit}
                  onChange={(e) =>
                    setEditForm({ ...editForm, monthlyLimit: e.target.value })
                  }
                  className="w-28 rounded border px-2 py-1 text-sm"
                />
                <button
                  onClick={() => saveEdit(budget.id)}
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
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {budget.category.name} — ${budget.monthlyLimit.toFixed(2)}/mo
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(budget)}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(budget.id)}
                    className="rounded border px-2 py-1 text-xs text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
            {editingId === budget.id && editError && (
              <p className="text-xs text-red-600">{editError}</p>
            )}
          </li>
        ))}
        {budgets.length === 0 && (
          <p className="text-sm text-zinc-500">No budgets yet.</p>
        )}
      </ul>
    </main>
  );
}
