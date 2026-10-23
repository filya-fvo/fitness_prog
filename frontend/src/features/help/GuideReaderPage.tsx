import { useEffect, useState, useSyncExternalStore } from "react";
import { Link, useParams } from "react-router-dom";
import { getStoredToken } from "@/api/client";
import { fetchGuide, type GuideKind } from "@/api/guides";
import { useUserStore } from "@/store/userStore";
import { isAdminUser } from "@/utils/adminAccess";
import { GuideDownloads } from "./GuideDownloads";
import { GuideDocument } from "./GuideDocument";

type ReadResult = { identity: string; text?: string; error?: string };
function subscribeCredential(listener: () => void) {
  const events = ["storage", "fitness:session-change", "focus", "pageshow"];
  for (const event of events) window.addEventListener(event, listener);
  return () => { for (const event of events) window.removeEventListener(event, listener); };
}

export function GuideReaderPage({ guideKind }: { guideKind?: GuideKind } = {}) {
  const { kind: routeKind } = useParams();
  const parameter = guideKind ?? routeKind;
  const kind: GuideKind | null = parameter === "user" || parameter === "admin" ? parameter : null;
  const user = useUserStore(state => state.user);
  const token = useSyncExternalStore(subscribeCredential, getStoredToken);
  const allowed = kind !== "admin" || (Boolean(token) && isAdminUser(user));
  const identity = kind === "admin" ? `${kind}:${user?.id ?? ""}:${token ?? ""}` : "user";
  const [result, setResult] = useState<ReadResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!kind || !allowed) return;
    let cancelled = false;
    const owner = user?.id, credential = token;
    async function load(selected: GuideKind) {
      try {
        const blob = await fetchGuide(selected);
        if (blob.size > 1024 * 1024) throw new Error("Guide too large");
        const text = await blob.text();
        if (!text.trim()) throw new Error("Empty guide");
        if (cancelled || (selected === "admin" && (useUserStore.getState().user?.id !== owner || !isAdminUser(useUserStore.getState().user) || getStoredToken() !== credential))) return;
        setResult({ identity, text });
      } catch {
        if (!cancelled) setResult({ identity, error: "Не удалось открыть инструкцию. Проверьте интернет и повторите загрузку." });
      }
    }
    void load(kind);
    return () => { cancelled = true; };
  }, [kind, allowed, identity, user?.id, token, attempt]);
  const visible = result?.identity === identity && allowed ? result : null;
  return <main className="app-shell min-h-screen text-tg-text">
    <div className="mx-auto max-w-3xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
      <Link to="/faq" className="app-button app-secondary-action mb-4 min-h-11">Назад к помощи</Link>
      <h1 className="mb-4 text-2xl font-bold">{kind === "admin" ? "Инструкция администратора" : kind === "user" ? "Инструкция пользователя" : "Инструкция не найдена"}</h1>
      {!kind ? <p>Выберите инструкцию в разделе помощи.</p> : !allowed ? <p role="status">Инструкция доступна только администратору</p> : <>
        <GuideDownloads readingKind={kind} />
        {visible?.error ? <div><p role="alert" className="app-status app-status-danger">{visible.error}</p><button type="button" className="app-button app-secondary-action mt-3 min-h-11" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Повторить загрузку</button></div>
          : visible?.text ? <GuideDocument text={visible.text} /> : <p role="status">Загружаем инструкцию…</p>}
      </>}
    </div>
  </main>;
}
