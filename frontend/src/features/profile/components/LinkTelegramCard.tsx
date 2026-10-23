import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "@/api/auth";
import { getStoredToken, setStoredToken } from "@/api/client";
import { cancelTelegramLink, completeTelegramLink, startTelegramLink, telegramLinkStatus, type TelegramLinkProof, type TelegramLinkResult } from "@/api/telegramLink";
import { adoptMergedLocalData } from "@/db/accountMerge";
import { useStoredToken } from "@/hooks/useStoredToken";
import { openExternalAppLink } from "@/lib/externalAppLink";
import { useUserStore } from "@/store/userStore";
import { cacheUserProfile } from "@/utils/profileCache";

type Draft = TelegramLinkProof & { bot_url: string; expiresAt: number };

export function LinkTelegramCard() {
  const user = useUserStore(state => state.user);
  const token = useStoredToken();
  if (!user || !token) return null;
  return <section aria-label="Telegram для этого аккаунта" className="app-card app-card-ocean my-3 p-4">
    <h2 className="text-sm font-semibold">Telegram для этого аккаунта</h2>
    {user.telegram_id ? <p role="status" className="mt-2 text-sm">Telegram подключён</p>
      : <LinkFlow key={`${user.id}:${token}`} user={user} credential={token} />}
  </section>;
}

function LinkFlow({ user, credential }: { user: AuthUser; credential: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ready, setReady] = useState<string | null>(null);
  const [preview, setPreview] = useState<TelegramLinkResult | null>(null);
  const [receipt, setReceipt] = useState<TelegramLinkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true), inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const active = () => mounted.current && useUserStore.getState().user?.id === user.id && getStoredToken() === credential;

  async function apply(result: TelegramLinkResult) {
    const linked = result.user;
    if (!linked || !result.access_token || (linked.id !== user.id && !linked.merged_from_user_ids?.includes(user.id))) {
      throw new Error("Invalid link receipt");
    }
    // Keep the receipt in memory for retry if device storage fails after the
    // server transaction committed; never repeat an already consumed request.
    await adoptMergedLocalData(linked);
    if (!active()) return;
    setStoredToken(result.access_token);
    cacheUserProfile(linked);
    useUserStore.getState().setUser(linked);
  }

  async function action(command: "start" | "status" | "complete" | "cancel", preference?: "email" | "telegram") {
    if (inFlight.current || !active()) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      if (command === "start") {
        const hex = (value: Uint8Array) => Array.from(value, byte => byte.toString(16).padStart(2, "0")).join("");
        const verifier = hex(crypto.getRandomValues(new Uint8Array(32)));
        const challenge = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
        const started = await startTelegramLink(challenge);
        if (active()) setDraft({ request_id: started.request_id, verifier, bot_url: started.bot_url, expiresAt: Date.now() + started.expires_in_sec * 1000 });
        return;
      }
      if (!draft) return;
      const proof = { request_id: draft.request_id, verifier: draft.verifier };
      if (command === "cancel") {
        await cancelTelegramLink(proof);
        if (active()) { setDraft(null); setReady(null); setPreview(null); setReceipt(null); }
      } else if (receipt) {
        await apply(receipt);
      } else if (Date.now() >= draft.expiresAt) {
        setDraft(null); setReady(null); setPreview(null);
        setError("Ссылка устарела. Начните подключение заново.");
      } else if (command === "status") {
        const result = await telegramLinkStatus(proof);
        if (active()) setReady(result.state === "ready" ? result.display_name || "Пользователь Telegram" : null);
      } else {
        const result = await completeTelegramLink(proof, preference, preference ? preview?.merge_target_id : undefined);
        if (!active()) return;
        if (result.merge_required) {
          if (!result.merge_preview || !result.merge_target_id) throw new Error("Missing merge preview");
          setPreview(result);
        } else {
          if (result.user?.id !== user.id && (!preference || preview?.merge_target_id !== result.user?.id)) {
            throw new Error("Unconfirmed account change");
          }
          setReceipt(result);
          await apply(result);
        }
      }
    } catch {
      if (active()) setError("Не удалось завершить действие. Проверьте интернет и повторите попытку.");
    } finally {
      inFlight.current = false;
      if (active()) setBusy(false);
    }
  }

  const button = "app-button app-secondary-action min-h-11 w-full disabled:opacity-60";
  return <div className="mt-2 space-y-3 text-sm">
    <p className="text-tg-hint">Подключите Telegram с подтверждением в боте, чтобы открывать этот же дневник без почты.</p>
    {!draft ? <button className={button} disabled={busy} onClick={() => void action("start")}>{busy ? "Подготавливаем…" : "Подключить Telegram"}</button>
      : receipt ? <button className={button} disabled={busy} onClick={() => void action("complete")}>Повторить завершение</button>
      : preview?.merge_preview ? <>
        <h3 className="font-semibold">Найдены два аккаунта</h3>
        <p>История обоих аккаунтов сохранится. Выберите основные данные профиля при совпадениях. Для входа сохранится почта этого аккаунта.</p>
        <ul className="list-disc pl-5 text-tg-hint">{preview.merge_preview.conflicts.map(value => <li key={value}>{value}</li>)}</ul>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {(["email", "telegram"] as const).map(kind => <div className="rounded-xl bg-tg-secondary p-3" key={kind}>
            <p className="font-semibold">{kind === "email" ? "Этот аккаунт" : "Telegram"}</p>
            <p>Тренировок: {preview.merge_preview![kind].counts.workouts ?? 0}</p>
            <p>Питание: {preview.merge_preview![kind].counts.nutrition ?? 0}</p>
          </div>)}
        </div>
        <button className={button} disabled={busy} onClick={() => void action("complete", "email")}>Основные данные — из этого аккаунта</button>
        <button className={button} disabled={busy} onClick={() => void action("complete", "telegram")}>Основные данные — из Telegram</button>
      </> : <>
        <p className="text-tg-hint">Откройте бота, нажмите «Подключить Telegram» и вернитесь сюда. Если бот показывает «Запустить», сначала нажмите её.</p>
        <a className={button} href={draft.bot_url} target="_blank" rel="noopener noreferrer" onClick={event => { event.preventDefault(); openExternalAppLink(draft.bot_url); }}>Открыть бота для подтверждения</a>
        {ready ? <><p>{ready}</p><button className={button} disabled={busy} onClick={() => void action("complete")}>Продолжить</button></>
          : <button className={button} disabled={busy} onClick={() => void action("status")}>Проверить подтверждение</button>}
      </>}
    {draft && !receipt ? <button className={button} disabled={busy} onClick={() => void action("cancel")}>Отменить подключение</button> : null}
    {error ? <p role="alert" className="app-status app-status-danger">{error}</p> : null}
  </div>;
}
