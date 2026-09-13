import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { auth } from "@/lib/auth";
import { TOOL_DEFINITIONS, TOOL_HANDLERS } from "@/lib/ai-tools/tools";

const SYSTEM_PROMPT = `You are the assistant for a personal expense tracker app.
You can only help with the user's own income, expenses, categories, and budgets,
using the tools provided — you have no other capabilities and no direct database
or SQL access. When asked about spending, prefer calling getSpendingSummary or
getBudgetStatus over guessing. When reporting proactive recommendations, only
report the "recommendations" data returned by getSpendingSummary — never invent
your own spending analysis or numbers.`;

const MAX_TOOL_ROUNDTRIPS = 5;

function isValidHistoryMessage(
  message: unknown,
): message is { role: "user" | "assistant"; content: string } {
  return (
    typeof message === "object" &&
    message !== null &&
    ((message as { role?: unknown }).role === "user" ||
      (message as { role?: unknown }).role === "assistant") &&
    typeof (message as { content?: unknown }).content === "string"
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.messages)) {
    return NextResponse.json(
      { error: "messages must be an array" },
      { status: 400 },
    );
  }

  // Only user/assistant messages from the client are trusted — system and
  // tool messages are only ever constructed server-side below.
  const history = body.messages.filter(isValidHistoryMessage);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
  ];

  try {
    const groq = new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
    });

    for (let i = 0; i < MAX_TOOL_ROUNDTRIPS; i++) {
      const completion = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages,
        tools: TOOL_DEFINITIONS,
      });

      const responseMessage = completion.choices[0].message;
      messages.push(responseMessage);

      const toolCalls = responseMessage.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return NextResponse.json({ reply: responseMessage.content ?? "" });
      }

      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") continue;

        let result: unknown;
        try {
          const handler = TOOL_HANDLERS[toolCall.function.name];
          if (!handler) {
            throw new Error(`Unknown tool: ${toolCall.function.name}`);
          }

          let parsedArgs: unknown = {};
          try {
            parsedArgs = toolCall.function.arguments
              ? JSON.parse(toolCall.function.arguments)
              : {};
          } catch {
            throw new Error("Invalid tool call arguments");
          }

          // session.user.id is the only source for the id used here —
          // parsedArgs is never consulted for one, and no handler
          // signature accepts a client/model-supplied id at all.
          result = await handler(session.user.id, parsedArgs);
        } catch (error: unknown) {
          result = {
            error: error instanceof Error ? error.message : "Tool call failed",
          };
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    return NextResponse.json(
      { error: "Assistant did not finish responding in time" },
      { status: 502 },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to reach the assistant" },
      { status: 502 },
    );
  }
}
