/**
 * Telegram Mini App helpers.
 * TZ §7: initData, theme, Haptics, MainButton.
 */

export type TelegramThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: {
    user?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
    };
    start_param?: string;
  };
  colorScheme?: "light" | "dark";
  themeParams?: TelegramThemeParams;
  ready: () => void;
  expand: () => void;
  /**
   * Closes the Mini App and sends data to the bot.
   * Do NOT use for analytics — only for intentional form submit flows.
   */
  sendData?: (data: string) => void;
  showConfirm?: (message: string, callback: (ok: boolean) => void) => void;
  showAlert?: (message: string, callback?: () => void) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
  MainButton?: {
    text: string;
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    setText: (text: string) => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
  };
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.Telegram?.WebApp ?? null;
}

/** Raw initData string for backend HMAC validation (TZ §8). */
export function getInitData(): string {
  return getTelegramWebApp()?.initData ?? "";
}

export function isTelegramEnvironment(): boolean {
  const wa = getTelegramWebApp();
  return Boolean(wa && wa.initData);
}

/** Apply Telegram theme CSS variables to :root (Tailwind tg-* colors). */
export function applyTelegramTheme(webApp: TelegramWebApp | null = getTelegramWebApp()): void {
  if (!webApp?.themeParams || typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const map: Record<string, string | undefined> = {
    "--tg-theme-bg-color": webApp.themeParams.bg_color,
    "--tg-theme-text-color": webApp.themeParams.text_color,
    "--tg-theme-hint-color": webApp.themeParams.hint_color,
    "--tg-theme-link-color": webApp.themeParams.link_color,
    "--tg-theme-button-color": webApp.themeParams.button_color,
    "--tg-theme-button-text-color": webApp.themeParams.button_text_color,
    "--tg-theme-secondary-bg-color": webApp.themeParams.secondary_bg_color,
  };
  for (const [key, value] of Object.entries(map)) {
    if (value) {
      root.style.setProperty(key, value);
    }
  }
  if (webApp.colorScheme) {
    root.dataset.colorScheme = webApp.colorScheme;
  }
  if (webApp.themeParams.bg_color && webApp.setBackgroundColor) {
    webApp.setBackgroundColor(webApp.themeParams.bg_color);
  }
}

export function initTelegramApp(): TelegramWebApp | null {
  const webApp = getTelegramWebApp();
  if (!webApp) {
    return null;
  }
  webApp.ready();
  webApp.expand();
  applyTelegramTheme(webApp);
  return webApp;
}

/**
 * Deep-link startapp param from:
 * - Telegram initDataUnsafe.start_param (t.me/...?...startapp=)
 * - URL ?startapp=... (web_app buttons with MINI_APP_URL)
 * - hash #startapp=...
 */
export function getStartParam(): string {
  const fromTg = getTelegramWebApp()?.initDataUnsafe?.start_param?.trim() ?? "";
  if (fromTg) return fromTg;

  if (typeof window === "undefined") return "";

  try {
    const q = new URLSearchParams(window.location.search).get("startapp");
    if (q && q.trim()) return q.trim();
  } catch {
    // ignore
  }

  try {
    const raw = (window.location.hash || "").replace(/^#/, "");
    if (!raw) return "";
    if (raw.startsWith("startapp=")) {
      return decodeURIComponent(raw.slice("startapp=".length).split("&")[0] || "").trim();
    }
    const hp = new URLSearchParams(raw);
    const h = hp.get("startapp");
    if (h && h.trim()) return h.trim();
  } catch {
    // ignore
  }

  return "";
}

/** Map startapp token → in-app path (used after Open from notifications). */
export function pathFromStartParam(start: string): string | null {
  const key = (start || "").trim();
  if (!key || key === "home" || key === "start" || key === "app") return "/";
  if (key.startsWith("workout_") && key.length > "workout_".length) {
    return `/workouts/active/${key.slice("workout_".length)}`;
  }
  if (key === "profile" || key === "measurements") return "/profile";
  if (key === "supplements" || key === "alerts" || key === "notifications") {
    const tab = key === "supplements" ? "supplements" : "alerts";
    return `/profile?tab=${tab}`;
  }
  if (key === "nutrition" || key === "food") return "/nutrition";
  if (key === "programs") return "/programs";
  if (key === "workouts") return "/workouts";
  if (key === "progress") return "/progress";
  if (key === "ai") return "/ai";
  return null;
}

/** Open t.me / tg:// link inside Telegram client when possible. */
export function openTelegramLink(url: string): void {
  const wa = getTelegramWebApp();
  if (wa?.openTelegramLink) {
    wa.openTelegramLink(url);
    return;
  }
  if (wa?.openLink) {
    wa.openLink(url);
    return;
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Open a direct chat with a user and optional prefilled text.
 * Message is sent by the user themselves (not by the bot).
 */
export function openUserChatWithText(username: string, text: string): void {
  const u = username.replace(/^@/, "").trim();
  const encoded = encodeURIComponent(text);
  openTelegramLink(`https://t.me/${u}?text=${encoded}`);
}

export function hapticImpact(style: "light" | "medium" | "heavy" = "light"): void {
  getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotification(type: "error" | "success" | "warning" = "success"): void {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type);
}

/**
 * Confirm dialog that works inside Telegram Mini App WebView.
 * window.confirm is unreliable / blocked on many mobile TG clients.
 */
export function confirmAction(message: string): Promise<boolean> {
  const wa = getTelegramWebApp();
  if (wa && typeof wa.showConfirm === "function") {
    return new Promise((resolve) => {
      try {
        wa.showConfirm!(message, (ok) => resolve(Boolean(ok)));
      } catch {
        resolve(window.confirm(message));
      }
    });
  }
  return Promise.resolve(window.confirm(message));
}
