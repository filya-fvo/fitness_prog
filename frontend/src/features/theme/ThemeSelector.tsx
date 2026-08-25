import { useState } from "react";

import {
  type ThemePreference,
  readThemePreference,
  setThemePreference,
} from "@/theme/theme";

const descriptions: Record<ThemePreference, string> = {
  system: "Повторяет тему Telegram или устройства.",
  light: "Всегда использовать светлое оформление.",
  dark: "Всегда использовать тёмное оформление.",
};

export function ThemeSelector() {
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference());

  return (
    <section className="surface-card mb-3 p-4" aria-labelledby="theme-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="theme-title" className="text-sm font-semibold">Оформление</h2>
          <p className="mt-1 text-xs text-tg-hint">{descriptions[preference]}</p>
        </div>
        <label className="block shrink-0 text-xs text-tg-hint">
          <span className="sr-only">Тема оформления</span>
          <select
            aria-label="Тема оформления"
            value={preference}
            onChange={(event) => {
              const next = event.target.value as ThemePreference;
              setPreference(next);
              setThemePreference(next);
            }}
            className="w-full min-w-52 rounded-xl bg-black/10 px-3 text-base text-tg-text sm:w-auto"
          >
            <option value="system">Как на устройстве</option>
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </label>
      </div>
    </section>
  );
}
