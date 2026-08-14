/**
 * AI trainer chat — TZ §5 / §6.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { analyzeProgress, fetchAIHistory, sendAIChat } from "@/api/ai";
import { getStoredToken } from "@/api/client";
import { Header } from "@/components/layout/Header";
import { toUserMessage } from "@/utils/errors";
import { trackEvent } from "@/lib/analytics";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: "llm" | "rule" | string;
};

const WELCOME_MESSAGE: Msg = {
  id: "welcome",
  role: "assistant",
  content:
    "Привет! Я ИИ-тренер. Спросите про технику, замену упражнений или прогресс. Лимит: 10 запросов в сутки. Это не медицинская консультация.",
};

function localDayKey(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isProgressRequest(message: string): boolean {
  const text = message.toLowerCase();
  return (
    /проанализ|прогресс/.test(text) ||
    /разбор.*недел/.test(text) ||
    /объ[её]м.*восстанов/.test(text)
  );
}

const QUICK = [
  "Почему болят колени?",
  "Замени жим лёжа",
  "Проанализируй мой прогресс за месяц",
  "Что есть после тренировки?",
  "Разбор недели: объём и восстановление",
] as const;

export function Chat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<Msg[]>([WELCOME_MESSAGE]);
  const [text, setText] = useState("");
  const sessionIdRef = useRef<string | null>(null);
  const [sending, setSending] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const sendingRef = useRef(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const prefiredRef = useRef(false);

  const send = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || sendingRef.current) return;
    if (!getStoredToken()) {
      setError("Нужна авторизация через Telegram или электронную почту");
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setError(null);
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setText("");

    try {
      const progressRequest = isProgressRequest(trimmed);
      if (progressRequest) {
        const result = await analyzeProgress(14, {
          sessionId: sessionIdRef.current,
          message: trimmed,
        });
        if (result.session_id) sessionIdRef.current = result.session_id;
        setRemaining(result.remaining_requests ?? null);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.report,
            source: result.source,
          },
        ]);
      } else {
        const result = await sendAIChat({ message: trimmed, sessionId: sessionIdRef.current });
        sessionIdRef.current = result.session_id;
        setRemaining(result.remaining_requests ?? null);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.reply,
            source: result.source,
          },
        ]);
      }
      trackEvent("ai_message_sent", {
        kind: progressRequest ? "analyze" : "chat",
        chars: trimmed.length,
      });
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      setError(toUserMessage(err, "ИИ-тренер временно недоступен"));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restoreToday() {
      if (!getStoredToken()) {
        setHistoryReady(true);
        return;
      }
      try {
        const result = await fetchAIHistory(localDayKey(), new Date().getTimezoneOffset());
        if (cancelled) return;
        sessionIdRef.current = result.session_id ?? null;
        if (result.messages.length) {
          setMessages(
            result.messages.map((item) => ({
              id: item.id,
              role: item.role,
              content: item.content,
            })),
          );
          window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 50);
        }
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, "Не удалось загрузить историю за сегодня"));
      } finally {
        if (!cancelled) setHistoryReady(true);
      }
    }
    void restoreToday();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!historyReady) return;
    if (prefiredRef.current) return;
    const q = (searchParams.get("q") || "").trim();
    if (!q) return;
    prefiredRef.current = true;
    setSearchParams({}, { replace: true });
    void send(q);
  }, [historyReady, searchParams, setSearchParams, send]);

  return (
    <section className="flex min-h-[70vh] flex-col">
      <Header
        title="ИИ-тренер"
        subtitle={!historyReady ? "Загрузка истории…" : remaining == null ? "Сегодня" : `Осталось: ${remaining}`}
      />
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            disabled={sending || !historyReady}
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
            {m.role === "assistant" && m.source ? (
              <span className="mt-1 block text-[10px] opacity-60">
                {m.source === "rule" ? "Локальный резервный ответ" : "Ответ ИИ-тренера"}
              </span>
            ) : null}
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
          disabled={!historyReady}
          placeholder="Сообщение тренеру…"
          className="flex-1 rounded-xl border border-black/10 bg-tg-secondary px-3 py-3 text-sm"
        />
        <button
          type="submit"
          aria-label="Отправить сообщение"
          disabled={sending || !historyReady || !text.trim()}
          className="rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50"
        >
          {sending ? "…" : "→"}
        </button>
      </form>
    </section>
  );
}
