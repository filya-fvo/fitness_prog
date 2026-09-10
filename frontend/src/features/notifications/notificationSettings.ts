import type { NotificationSettings } from "@/api/notifications";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const TIMEZONE_CITIES: Record<string, string> = {
  "Europe/Kaliningrad": "Калининград",
  "Europe/Moscow": "Москва",
  "Europe/Samara": "Самара",
  "Asia/Yekaterinburg": "Екатеринбург",
  "Asia/Omsk": "Омск",
  "Asia/Krasnoyarsk": "Красноярск",
  "Asia/Irkutsk": "Иркутск",
  "Asia/Yakutsk": "Якутск",
  "Asia/Vladivostok": "Владивосток",
  "Asia/Magadan": "Магадан",
  "Asia/Kamchatka": "Камчатка",
};

export function detectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow";
  } catch {
    return "Europe/Moscow";
  }
}

export function timezoneLabel(timezone: string): string {
  const city = TIMEZONE_CITIES[timezone]
    || timezone.split("/").at(-1)?.replaceAll("_", " ")
    || timezone;
  try {
    const parts = new Intl.DateTimeFormat("ru-RU", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    }).formatToParts(new Date());
    const offset = parts.find((part) => part.type === "timeZoneName")?.value
      .replace("GMT", "UTC");
    return offset ? `${city}, ${offset}` : city;
  } catch {
    return city;
  }
}

export function workoutSummary(settings: NotificationSettings): string {
  if (!settings.workouts.enabled) return "Выключены";
  const days = settings.workouts.days
    .filter((day) => day >= 0 && day < WEEKDAYS.length)
    .map((day) => WEEKDAYS[day])
    .join(", ");
  return `${days || "Дни не выбраны"} · ${settings.workouts.time}`;
}

export function timesSummary(times: string[]): string {
  return times.length ? times.join(", ") : "Время не выбрано";
}

export function lastDeliveryLabel(
  delivery: { channel: "telegram" | "browser"; delivered_at: string } | null,
): string {
  if (!delivery) return "Успешных доставок пока нет";
  const date = new Date(delivery.delivered_at);
  if (Number.isNaN(date.getTime())) return "Последняя доставка выполнена";
  const channel = delivery.channel === "telegram" ? "Telegram" : "браузер";
  return `${channel} · ${date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}`;
}
