"use client";

import { useEffect, useState } from "react";

type Category = { id: string; name: string };

export function CategoriesClient() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(
    null,
  );

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => setLoadError("Failed to load categories"));
  }, []);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setFormError(body.error);
      return;
    }

    setCategories((prev) => (prev ? [...prev, body] : [body]));
    setName("");
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    setEditError(null);

    const res = await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
    const body = await res.json();

    if (!res.ok) {
      setEditError(body.error);
      return;
    }

    setCategories((prev) =>
      prev ? prev.map((c) => (c.id === id ? body : c)) : prev,
    );
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this category?")) return;
    setDeleteError(null);

    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCategories((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
      return;
    }

    const body = await res.json();
    setDeleteError({ id, message: body.error });
  }

  if (loadError) {
    return <main className="p-8 text-red-600">{loadError}</main>;
  }
  if (!categories) {
    return <main className="p-8">Loading...</main>;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Categories</h1>

      <form onSubmit={handleAdd} className="flex items-end gap-2 rounded border p-4">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs text-zinc-500">Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <ul className="flex flex-col gap-2">
        {categories.map((category) => (
          <li key={category.id} className="flex flex-col gap-1 rounded border p-3">
            <div className="flex items-center justify-between">
              {editingId === category.id ? (
                <div className="flex flex-1 gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 rounded border px-2 py-1 text-sm"
                  />
                  <button
                    onClick={() => saveEdit(category.id)}
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
                <>
                  <span className="text-sm">{category.name}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(category)}
                      className="rounded border px-2 py-1 text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(category.id)}
                      className="rounded border px-2 py-1 text-xs text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
            {editingId === category.id && editError && (
              <p className="text-xs text-red-600">{editError}</p>
            )}
            {deleteError?.id === category.id && (
              <p className="text-xs text-red-600">{deleteError.message}</p>
            )}
          </li>
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-zinc-500">No categories yet.</p>
        )}
      </ul>
    </main>
  );
}
