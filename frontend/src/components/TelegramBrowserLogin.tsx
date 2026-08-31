import { useState } from "react";

import {
  getTelegramBrowserLoginConfig,
  loginWithTelegramIdToken,
  type AuthUser,
} from "@/api/auth";
import { openTelegramLogin } from "@/lib/telegramLogin";
import { toUserMessage } from "@/utils/errors";

type Props = {
  onSuccess: (user: AuthUser) => void;
};

export function TelegramBrowserLogin({ onSuccess }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login() {
    setBusy(true);
    setError(null);
    try {
      const config = await getTelegramBrowserLoginConfig();
      if (!config.enabled || !config.client_id || !config.nonce) {
        throw new Error("Вход через Telegram пока не настроен");
      }
      const idToken = await openTelegramLogin(config.client_id, config.nonce);
      const result = await loginWithTelegramIdToken(idToken, config.nonce);
      const { adoptMergedLocalData } = await import("@/db/accountMerge");
      await adoptMergedLocalData(result.user);
      onSuccess(result.user);
    } catch (cause) {
      setError(toUserMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-2xl bg-tg-secondary p-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => void login()}
        className="min-h-11 w-full rounded-xl bg-[#229ED9] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Открываем…" : "Войти через Telegram"}
      </button>
      {error ? <p className="mt-2 text-xs text-red-500" role="alert">{error}</p> : null}
    </div>
  );
}
