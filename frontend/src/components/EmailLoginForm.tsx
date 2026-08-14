import { useEffect, useState, type FormEvent } from "react";

import { loginWithEmailCode, requestEmailLoginCode, type AuthUser } from "@/api/auth";
import { adoptMergedLocalData } from "@/db/accountMerge";
import {
  clearOtpDraft,
  OTP_DRAFT_LOGIN_KEY,
  readOtpDraft,
  writeOtpDraft,
} from "@/utils/otpDraft";
import { toUserMessage } from "@/utils/errors";

type Props = {
  onSuccess: (user: AuthUser) => void;
};

/**
 * Browser-only email OTP login (outside Telegram WebApp).
 * Draft is persisted so a tab refresh does not drop the code step.
 */
export function EmailLoginForm({ onSuccess }: Props) {
  const restored = readOtpDraft(OTP_DRAFT_LOGIN_KEY);
  const [email, setEmail] = useState(restored?.email || "");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">(restored ? "code" : "email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(restored?.info ?? null);
  const [devCode, setDevCode] = useState<string | null>(restored?.devCode ?? null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (step !== "code") return;
    const draft = readOtpDraft(OTP_DRAFT_LOGIN_KEY);
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
    writeOtpDraft(OTP_DRAFT_LOGIN_KEY, {
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
      setError("Введите корректный адрес электронной почты");
      return;
    }
    setBusy(true);
    try {
      const res = await requestEmailLoginCode(value);
      setStep("code");
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
        toUserMessage(err, "Не удалось отправить код");
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
      const res = await loginWithEmailCode(email.trim(), code.trim());
      await adoptMergedLocalData(res.user);
      clearOtpDraft(OTP_DRAFT_LOGIN_KEY);
      onSuccess(res.user);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        toUserMessage(err, "Не удалось подтвердить код");
      setError(typeof msg === "string" ? msg : "Неверный код");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-2xl bg-tg-secondary p-4">
      <p className="text-sm font-semibold">Вход или регистрация по электронной почте</p>
      <p className="mt-1 text-xs text-tg-hint">
        Если аккаунта ещё нет, он будет создан после подтверждения кода. Код придёт с адреса fil_fit_bot@mail.ru.
      </p>

      {step === "email" ? (
        <form className="mt-3 space-y-2" onSubmit={(e) => void onRequestCode(e)}>
          <label className="block text-xs text-tg-hint">
            Электронная почта
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-xl border border-black/10 bg-tg-bg px-3 py-2 text-sm text-tg-text"
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-tg-button px-3 py-2.5 text-sm font-semibold text-tg-button-text disabled:opacity-60"
          >
            {busy ? "Отправляем…" : "Получить код"}
          </button>
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
              className="mt-1 w-full rounded-xl border border-black/10 bg-tg-bg px-3 py-2 text-center text-lg font-semibold tracking-[0.3em] text-tg-text"
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy || code.length < 4}
            className="w-full rounded-xl bg-tg-button px-3 py-2.5 text-sm font-semibold text-tg-button-text disabled:opacity-60"
          >
            {busy ? "Проверяем…" : "Войти или зарегистрироваться"}
          </button>
          <div className="flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              className="text-tg-link"
              onClick={() => {
                clearOtpDraft(OTP_DRAFT_LOGIN_KEY);
                setStep("email");
                setCode("");
                setInfo(null);
                setDevCode(null);
                setError(null);
              }}
            >
              Изменить адрес
            </button>
            <button
              type="button"
              disabled={busy || resendIn > 0}
              className="text-tg-link disabled:text-tg-hint disabled:no-underline"
              onClick={() => void onRequestCode()}
            >
              {resendIn > 0 ? `Новый код через ${resendIn}с` : "Отправить код ещё раз"}
            </button>
          </div>
        </form>
      )}

      {info ? <p className="mt-2 text-xs text-tg-hint">{info}</p> : null}
      {devCode ? (
        <p className="mt-2 rounded-lg bg-amber-500/15 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          Dev-режим (SMTP не настроен): код <span className="font-mono font-semibold">{devCode}</span>
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
