import axios from "axios";

import { plusRequiredDetail } from "@/api/subscriptionError";

const STATUS_MESSAGES: Record<number, string> = {
  400: "Проверьте введённые данные и попробуйте снова.",
  401: "Сессия истекла. Войдите в приложение снова.",
  403: "Для этого действия недостаточно прав.",
  404: "Запрошенные данные не найдены.",
  409: "Данные уже изменились. Обновите экран и повторите действие.",
  422: "Не удалось обработать введённые данные.",
  429: "Слишком много запросов. Подождите немного и попробуйте снова.",
};

const WORKOUT_CHANGE_CONFLICTS = new Set([
  "План тренировки уже изменился. Записанный результат сохранён на устройстве",
  "Это упражнение уже есть в плане или истории тренировки",
  "В тренировке уже 20 упражнений",
  "Сначала синхронизируйте записанные подходы",
  "В этой части тренировки больше нет незавершённых подходов",
  "В убираемых подходах есть сохранённые записи",
  "Оставьте хотя бы один подход для каждого участника связки",
]);

export function isRetryableApiError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return !status || status === 408 || status === 429 || status >= 500;
}

export function toUserMessage(error: unknown, fallback = "Что-то пошло не так. Попробуйте ещё раз."): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "Нет сети. Проверьте подключение или продолжите офлайн.";
  }
  if (axios.isAxiosError(error)) {
    const plusDetail = plusRequiredDetail(error);
    if (plusDetail) return plusDetail.message;
    const status = error.response?.status;
    const detail = error.response?.data?.detail;
    if (status === 409 && typeof detail === "string" && WORKOUT_CHANGE_CONFLICTS.has(detail)) return detail;
    if (
      status === 429 &&
      typeof detail === "string" &&
      (detail.startsWith("Дневной лимит ИИ") || detail.startsWith("Дневной лимит AI"))
    ) {
      return detail;
    }
    if (status && STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
    if (status && status >= 500) return "Сервис временно недоступен. Попробуйте немного позже.";
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return "Сервис отвечает слишком долго. Попробуйте ещё раз.";
    }
    if (!error.response) return "Не удалось связаться с сервером. Проверьте интернет.";
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    const cyrillic = (message.match(/[а-яё]/gi) || []).length;
    const latin = (message.match(/[a-z]/gi) || []).length;
    if (
      message &&
      !/request failed|status code|network error|fetch failed/i.test(message) &&
      !(latin >= 5 && cyrillic < 3)
    ) {
      return message;
    }
  }
  return fallback;
}
