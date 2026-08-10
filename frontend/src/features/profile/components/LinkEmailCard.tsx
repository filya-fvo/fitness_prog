import { useEffect, useState, type FormEvent } from "react";

import {
  requestEmailLinkCode,
  verifyEmailLinkCode,
  type AuthUser,
} from "@/api/auth";
import {
  clearOtpDraft,
  OTP_DRAFT_LINK_KEY,
  readOtpDraft,
  writeOtpDraft,
} from "@/utils/otpDraft";

type Props = {
  currentEmail?: string | null;
  onLinked: (user: AuthUser) => void;
};

/**
 * Attach / change auth email for the logged-in account (Telegram → browser login).
 * OTP step is persisted so returning from the Mail app does not lose the code form.
 */
export function LinkEmailCard({ currentEmail, onLinked }: Props) {
  const restored = readOtpDraft(OTP_DRAFT_LINK_KEY);
  const [email, setEmail] = useState(restored?.email || currentEmail || "");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"idle" | "code">(restored ? "code" : "idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(restored?.info ?? null);
  const [devCode, setDevCode] = useState<string | null>(restored?.devCode ?? null);
  const [resendIn, setResendIn] = useState(0);
  const [editing, setEditing] = useState(Boolean(restored) || !currentEmail);

  useEffect(() => {
    if (step !== "code") return;
    const draft = readOtpDraft(OTP_DRAFT_LINK_KEY);
    const until = draft?.resendUntil ?? null;
    if (!until) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setResendIn(left);
      return left;
    };
    tick();
    const id = window.setInterval(() => {
      if (tick() <= 0) window.clearInterval(id);
    }, 500);
    return () => window.clearInterval(id);
  }, [step, info, email]);

  useEffect(() => {
    if (step === "code") return;
    if (!editing && currentEmail) setEmail(currentEmail);
  }, [currentEmail, editing, step]);

  function persistCodeStep(next: {
    email: string;
    info?: string | null;
    devCode?: string | null;
    resendAfterSec?: number;
  }) {
    const resendUntil =
      next.resendAfterSec && next.resendAfterSec > 0
        ? Date.now() + next.resendAfterSec * 1000
        : null;
    writeOtpDraft(OTP_DRAFT_LINK_KEY, {
      email: next.email,
      info: next.info,
      devCode: next.devCode,
      resendUntil,
    });
  }

  async function onRequestCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setInfo(null);
    setDevCode(null);
    const value = email.trim();
    if (!value.includes("@")) {
      setError("Введите корректный email");
      return;
    }
    setBusy(true);
    try {
      const res = await requestEmailLinkCode(value);
      setStep("code");
      setEditing(true);
      setInfo(res.message);
      if (res.dev_code) setDevCode(res.dev_code);
      setResendIn(res.resend_after_sec || 60);
      persistCodeStep({
        email: value,
        info: res.message,
        devCode: res.dev_code ?? null,
        resendAfterSec: res.resend_after_sec || 60,
      });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err instanceof Error ? err.message : "Не удалось отправить код");
      setError(typeof msg === "string" ? msg : "Не удалось отправить код");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await verifyEmailLinkCode(email.trim(), code.trim());
      clearOtpDraft(OTP_DRAFT_LINK_KEY);
      setInfo(res.message);
      setStep("idle");
      setEditing(false);
      setCode("");
      setDevCode(null);
      onLinked(res.user);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err instanceof Error ? err.message : "Неверный код");
      setError(typeof msg === "string" ? msg : "Неверный код");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-tg-secondary p-4">
      <p className="text-sm font-medium">Почта для входа в браузере</p>
      <p className="mt-1 text-xs text-tg-hint">
        Привяжите email к этому аккаунту — потом можно открыть приложение в браузере и войти
        кодом с почты, с тем же прогрессом и программой. Можно свернуть приложение, открыть
        почту и вернуться — поле кода сохранится.
      </p>

      {currentEmail && !editing && step !== "code" ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm">
            Привязано: <span className="font-medium">{currentEmail}</span>
          </p>
          <button
            type="button"
            className="text-xs text-tg-link"
            onClick={() => {
              setEditing(true);
              setEmail(currentEmail);
              setStep("idle");
              setError(null);
              setInfo(null);
            }}
          >
            Сменить почту
          </button>
        </div>
      ) : null}

      {editing || !currentEmail || step === "code" ? (
        step === "idle" ? (
          <form className="mt-3 space-y-2" onSubmit={(e) => void onRequestCode(e)}>
            <label className="block text-xs text-tg-hint">
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@mail.ru"
                className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
                required
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-xl bg-tg-button px-3 py-2 text-sm font-semibold text-tg-button-text disabled:opacity-60"
              >
                {busy ? "Отправляем…" : "Получить код"}
              </button>
              {currentEmail ? (
                <button
                  type="button"
                  className="rounded-xl bg-tg-bg px-3 py-2 text-sm"
                  onClick={() => {
                    clearOtpDraft(OTP_DRAFT_LINK_KEY);
                    setEditing(false);
                    setEmail(currentEmail);
                    setError(null);
                    setInfo(null);
                  }}
                >
                  Отмена
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <form className="mt-3 space-y-2" onSubmit={(e) => void onVerify(e)}>
            <p className="text-xs text-tg-hint">
              Код отправлен на <span className="font-medium text-tg-text">{email}</span>
            </p>
            <label className="block text-xs text-tg-hint">
              Код из письма
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="6 цифр"
                className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-center text-lg font-semibold tracking-[0.25em]"
                required
              />
            </label>
            <button
              type="submit"
              disabled={busy || code.length < 4}
              className="w-full rounded-xl bg-tg-button px-3 py-2 text-sm font-semibold text-tg-button-text disabled:opacity-60"
            >
              {busy ? "Проверяем…" : "Привязать почту"}
            </button>
            <div className="flex justify-between text-xs">
              <button
                type="button"
                className="text-tg-link"
                onClick={() => {
                  clearOtpDraft(OTP_DRAFT_LINK_KEY);
                  setStep("idle");
                  setCode("");
                  setDevCode(null);
                }}
              >
                Изменить email
              </button>
              <button
                type="button"
                disabled={busy || resendIn > 0}
                className="text-tg-link disabled:text-tg-hint"
                onClick={() => void onRequestCode()}
              >
                {resendIn > 0 ? `Ещё раз через ${resendIn}с` : "Отправить снова"}
              </button>
            </div>
          </form>
        )
      ) : null}

      {info ? <p className="mt-2 text-xs text-tg-hint">{info}</p> : null}
      {devCode ? (
        <p className="mt-2 rounded-lg bg-amber-500/15 px-2 py-1.5 text-xs">
          Dev: код <span className="font-mono font-semibold">{devCode}</span>
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
