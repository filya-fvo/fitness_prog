const TELEGRAM_LOGIN_SCRIPT = "https://telegram.org/js/telegram-login.js";
const TELEGRAM_OAUTH_PREFIX = "https://oauth.telegram.org/auth?";

type TelegramLoginResult = {
  id_token?: string;
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
    window.open = ((url?: string | URL, target?: string, features?: string) =>
      nativeOpen.call(
        window,
        url ? addTelegramOAuthOrigin(url.toString(), window.location.origin) : url,
        target,
        features,
      )) as typeof window.open;
    try {
      sdk.auth({ client_id: clientId, scope: ["profile"], lang: "ru", nonce }, (result) => {
        if (result.id_token) resolve(result.id_token);
        else reject(new Error("Вход через Telegram не завершён"));
      });
    } finally {
      window.open = nativeOpen;
    }
  });
}
