/**
 * Web email OTP login form (browser outside Telegram).
 */
import { FormEvent, useState } from "react";

import { loginWithEmailCode, requestEmailLoginCode } from "@/api/auth";
import { useUserStore } from "@/store/userStore";

export function EmailLoginForm() {
  const setUser = useUserStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugCode, setDebugCode] = useState<string | null>(null);

  async function onRequestCode(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    setDebugCode(null);
    try {
      const res = await requestEmailLoginCode(email.trim());
      setStep("code");
      setInfo(res.message || "Код отправлен");
      if (res.debug_code) setDebugCode(res.debug_code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отправки кода");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await loginWithEmailCode(email.trim(), code.trim());
      setUser(res.user);
      setInfo("Вход выполнен");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-2xl bg-tg-secondary p-4">
      <p className="text-sm font-medium">Вход по email</p>
      <p className="mt-1 text-xs text-tg-hint">
        Для сайта вне Telegram. Код придёт на почту (если настроен SMTP) или в Telegram,
        если email уже привязан к аккаунту.
      </p>

      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
      {info ? <p className="mt-2 text-xs text-tg-link">{info}</p> : null}
      {debugCode ? (
        <p className="mt-1 text-xs text-tg-hint">
          Dev-код: <span className="font-mono">{debugCode}</span>
        </p>
      ) : null}

      {step === "email" ? (
        <form className="mt-3 space-y-2" onSubmit={(e) => void onRequestCode(e)}>
          <label className="block text-xs text-tg-hint">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
              placeholder="you@example.com"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="w-full rounded-xl bg-tg-button px-3 py-2 text-sm font-semibold text-tg-button-text disabled:opacity-60"
          >
            {busy ? "Отправка…" : "Получить код"}
          </button>
        </form>
      ) : (
        <form className="mt-3 space-y-2" onSubmit={(e) => void onVerify(e)}>
          <p className="text-xs text-tg-hint">Код для {email}</p>
          <label className="block text-xs text-tg-hint">
            Код из письма / Telegram
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm tracking-widest"
              placeholder="123456"
              maxLength={12}
            />
          </label>
          <button
            type="submit"
            disabled={busy || code.trim().length < 4}
            className="w-full rounded-xl bg-tg-button px-3 py-2 text-sm font-semibold text-tg-button-text disabled:opacity-60"
          >
            {busy ? "Проверка…" : "Войти"}
          </button>
          <button
            type="button"
            className="w-full text-xs text-tg-link"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
              setInfo(null);
              setDebugCode(null);
            }}
          >
            Изменить email
          </button>
        </form>
      )}
    </div>
  );
}
