export const THEME_STORAGE_KEY = "fitness_theme_preference";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

type ThemeWebApp = {
  colorScheme?: ResolvedTheme;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent?: (eventType: "themeChanged", callback: () => void) => void;
  offEvent?: (eventType: "themeChanged", callback: () => void) => void;
};

const palette: Record<ResolvedTheme, { background: string; header: string }> = {
  dark: { background: "#040b16", header: "#07111f" },
  light: { background: "#eaf1f8", header: "#f7fbff" },
};

let browserListenerInstalled = false;
let telegramListenerTarget: ThemeWebApp | null = null;
let telegramThemeHandler: (() => void) | null = null;

function currentWebApp(): ThemeWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function readThemePreference(storage?: Pick<Storage, "getItem">): ThemePreference {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
    const value = target?.getItem(THEME_STORAGE_KEY) ?? null;
    return isThemePreference(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(
  preference: ThemePreference,
  telegramColorScheme?: ResolvedTheme,
  systemPrefersDark = false,
): ResolvedTheme {
  if (preference !== "system") return preference;
  if (telegramColorScheme === "light" || telegramColorScheme === "dark") {
    return telegramColorScheme;
  }
  return systemPrefersDark ? "dark" : "light";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyThemePreference(
  preference = readThemePreference(),
  webApp: ThemeWebApp | null = currentWebApp(),
): ResolvedTheme {
  const resolved = resolveTheme(preference, webApp?.colorScheme, systemPrefersDark());
  if (typeof document === "undefined") return resolved;

  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.classList.toggle("dark", resolved === "dark");

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  meta?.setAttribute("content", palette[resolved].header);
  webApp?.setHeaderColor?.(palette[resolved].header);
  webApp?.setBackgroundColor?.(palette[resolved].background);
  return resolved;
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Theme still applies for the current session when storage is unavailable.
  }
  applyThemePreference(preference);
}

export function initializeTheme(webApp: ThemeWebApp | null = currentWebApp()): ResolvedTheme {
  const resolved = applyThemePreference(readThemePreference(), webApp);
  if (typeof window === "undefined") return resolved;

  if (!browserListenerInstalled && typeof window.matchMedia === "function") {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener?.("change", () => {
      if (readThemePreference() === "system") applyThemePreference("system");
    });
    browserListenerInstalled = true;
  }

  if (webApp && telegramListenerTarget !== webApp) {
    if (telegramListenerTarget && telegramThemeHandler) {
      telegramListenerTarget.offEvent?.("themeChanged", telegramThemeHandler);
    }
    const handleTelegramTheme = () => {
      if (readThemePreference() === "system") applyThemePreference("system", webApp);
    };
    webApp.onEvent?.("themeChanged", handleTelegramTheme);
    telegramListenerTarget = webApp;
    telegramThemeHandler = handleTelegramTheme;
  }
  return resolved;
}
