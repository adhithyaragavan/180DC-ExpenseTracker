"use client";

import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export function ChatWidget() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim() || sending) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: input }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error ?? "Something went wrong");
      }
      setMessages([...nextMessages, { role: "assistant", content: body.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded border p-4">
      <h2 className="text-lg font-medium">Ask your assistant</h2>

      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500">
            Try: &quot;What&apos;s my budget status?&quot; or &quot;Add a $12 expense in
            Coffee&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "self-end bg-blue-600 text-white"
                : "self-start bg-zinc-100 text-zinc-900"
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && <p className="text-sm text-zinc-500">Thinking...</p>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your spending..."
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
