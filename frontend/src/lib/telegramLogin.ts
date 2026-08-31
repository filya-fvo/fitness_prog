const TELEGRAM_LOGIN_SCRIPT = "https://telegram.org/js/telegram-login.js";
const TELEGRAM_OAUTH_ORIGIN = "https://oauth.telegram.org";
const TELEGRAM_OAUTH_PREFIX = "https://oauth.telegram.org/auth?";
const POPUP_RESULT_GRACE_MS = 1_500;

type TelegramLoginResult = {
  id_token?: string;
  error?: string;
};

type TelegramLoginSdk = {
  auth: (
    options: {
      client_id: number;
      scope: ["profile"];
      lang: "ru";
      nonce: string;
    },
    callback: (result: TelegramLoginResult) => void,
  ) => void;
};

type TelegramRootWithLogin = NonNullable<Window["Telegram"]> & {
  Login?: TelegramLoginSdk;
};

function getLoginSdk(): TelegramLoginSdk | null {
  return (window.Telegram as TelegramRootWithLogin | undefined)?.Login ?? null;
}

async function loadTelegramLoginSdk(): Promise<TelegramLoginSdk> {
  const existing = getLoginSdk();
  if (existing) return existing;

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TELEGRAM_LOGIN_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });

  const sdk = getLoginSdk();
  if (!sdk) throw new Error("Не удалось открыть вход через Telegram");
  return sdk;
}

export function addTelegramOAuthOrigin(
  rawUrl: string,
  applicationOrigin: string,
): string {
  if (!rawUrl.startsWith(TELEGRAM_OAUTH_PREFIX)) return rawUrl;
  return `${rawUrl}&origin=${encodeURIComponent(applicationOrigin)}`;
}

export async function openTelegramLogin(clientId: number, nonce: string): Promise<string> {
  const sdk = await loadTelegramLoginSdk();
  return new Promise<string>((resolve, reject) => {
    const nativeOpen = window.open;
    let settled = false;
    let popupClosedTimer: number | null = null;

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      if (popupClosedTimer !== null) window.clearTimeout(popupClosedTimer);
    };
    const finish = (idToken?: string, error?: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (idToken) resolve(idToken);
      else if (error === "popup_closed") {
        reject(new Error("Окно Telegram закрылось до завершения входа"));
      } else {
        reject(new Error("Telegram не подтвердил вход. Попробуйте ещё раз"));
      }
    };
    const handleResult = (result: TelegramLoginResult) => {
      if (result.id_token) {
        finish(result.id_token);
      } else if (result.error === "popup_closed") {
        // On mobile Chrome the popup can report closed just before postMessage
        // with the successful auth_result reaches its opener.
        popupClosedTimer = window.setTimeout(
          () => finish(undefined, result.error),
          POPUP_RESULT_GRACE_MS,
        );
      } else {
        finish(undefined, result.error);
      }
    };
    function handleMessage(event: MessageEvent) {
      if (event.origin !== TELEGRAM_OAUTH_ORIGIN) return;
      let data: unknown = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data) as unknown;
        } catch {
          return;
        }
      }
      if (!data || typeof data !== "object") return;
      const payload = data as { event?: unknown; result?: unknown; error?: unknown };
      if (payload.event !== "auth_result") return;
      handleResult({
        id_token: typeof payload.result === "string" ? payload.result : undefined,
        error: typeof payload.error === "string" ? payload.error : undefined,
      });
    }

    window.addEventListener("message", handleMessage);
    window.open = ((url?: string | URL, target?: string, features?: string) =>
      nativeOpen.call(
        window,
        url ? addTelegramOAuthOrigin(url.toString(), window.location.origin) : url,
        target,
        features,
      )) as typeof window.open;
    try {
      sdk.auth(
        { client_id: clientId, scope: ["profile"], lang: "ru", nonce },
        handleResult,
      );
    } catch (error) {
      finish(undefined, error instanceof Error ? error.message : undefined);
    } finally {
      window.open = nativeOpen;
    }
  });
}
