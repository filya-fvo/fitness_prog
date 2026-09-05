import type {
  AdminSystemHistorySnapshot,
  AdminSystemStatus,
} from "@/api/adminSystem";

export const SYSTEM_STATUS_LABELS: Record<AdminSystemStatus, string> = {
  normal: "Норма",
  attention: "Требует внимания",
  error: "Ошибка",
  no_data: "Нет данных",
};

const CHECK_TITLES: Record<AdminSystemHistorySnapshot["items"][number]["key"], string> = {
  api: "API",
  database: "PostgreSQL",
  redis: "Redis",
  worker: "Worker",
  notifications: "Уведомления",
  queue: "Очередь",
  backup: "Резервная копия",
  deployment: "Версия",
  https: "HTTPS",
  llm: "Локальный ИИ",
  ocr: "Распознавание этикеток",
  telegram: "Telegram",
  email: "Email",
};

export function summarizeSystemSnapshot(snapshot: AdminSystemHistorySnapshot): string {
  const deviations = snapshot.items.filter((item) => item.status !== "normal");
  if (!deviations.length) return "Все проверки в норме";

  const visible = deviations
    .slice(0, 3)
    .map((item) => `${CHECK_TITLES[item.key]} — ${SYSTEM_STATUS_LABELS[item.status]}`);
  const hiddenCount = deviations.length - visible.length;
  return hiddenCount > 0 ? `${visible.join("; ")}; ещё ${hiddenCount}` : visible.join("; ");
}
