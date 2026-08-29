import type { SupportCategory, SupportStatus } from "@/api/support";

export const categoryLabels: Record<SupportCategory, string> = {
  bug: "Ошибка в приложении",
  question: "Вопрос",
  idea: "Предложение",
  other: "Другое",
};

export const statusLabels: Record<SupportStatus, string> = {
  waiting_support: "Ждёт ответа поддержки",
  waiting_user: "Поддержка ответила",
  resolved: "Решено",
  closed: "Закрыто",
};

export function formatSupportDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
