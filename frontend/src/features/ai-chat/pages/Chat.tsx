/**
 * AI trainer chat — TZ §5 / §6.
 */
import { useRef, useState } from "react";

import { analyzeProgress, sendAIChat } from "@/api/ai";
import { getStoredToken } from "@/api/client";
import { Header } from "@/components/layout/Header";
import { trackEvent } from "@/lib/analytics";

type Msg = { id: string; role: "user" | "assistant"; content: string };

const QUICK = [
  "Почему болят колени?",
  "Замени жим лёжа",
  "Проанализируй мой прогресс за месяц",
] as const;

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Привет! Я AI-тренер. Спросите про технику, замену упражнений или прогресс. Лимит: 15 запросов/сутки.",
    },
  ]);
  const [text, setText] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    if (!getStoredToken()) {
      setError("Нужна авторизация в Telegram");
      return;
    }
    setSending(true);
    setError(null);
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setText("");

    try {
      if (trimmed.toLowerCase().includes("проанализируй") || trimmed.toLowerCase().includes("прогресс")) {
        const result = await analyzeProgress(14);
        setRemaining(result.remaining_requests ?? null);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.report,
          },
        ]);
      } else {
        const result = await sendAIChat({ message: trimmed, sessionId });
        setSessionId(result.session_id);
        setRemaining(result.remaining_requests ?? null);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.reply,
          },
        ]);
      }
      trackEvent("ai_message_sent", {
        kind: trimmed.toLowerCase().includes("прогресс") ? "analyze" : "chat",
        chars: trimmed.length,
      });
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI недоступен");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex min-h-[70vh] flex-col">
      <Header title="AI-тренер" subtitle={remaining == null ? "Чат" : `Осталось: ${remaining}`} />
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            disabled={sending}
            onClick={() => void send(q)}
            className="rounded-full bg-tg-secondary px-3 py-1.5 text-xs"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto pb-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={[
              "max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
              m.role === "user"
                ? "ml-auto bg-tg-button text-tg-button-text"
                : "mr-auto bg-tg-secondary",
            ].join(" ")}
          >
            {m.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        className="sticky bottom-16 flex gap-2 bg-tg-bg pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Сообщение тренеру…"
          className="flex-1 rounded-xl border border-black/10 bg-tg-secondary px-3 py-3 text-sm"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50"
        >
          {sending ? "…" : "→"}
        </button>
      </form>
    </section>
  );
}
