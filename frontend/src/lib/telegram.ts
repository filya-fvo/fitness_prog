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
  sendData?: (data: string) => void;
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

/** Deep-link startapp param from reminder links (workout_<id>). */
export function getStartParam(): string {
  return getTelegramWebApp()?.initDataUnsafe?.start_param ?? "";
}

export function hapticImpact(style: "light" | "medium" | "heavy" = "light"): void {
  getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotification(type: "error" | "success" | "warning" = "success"): void {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type);
}
