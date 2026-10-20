import axios from "axios";
import { toUserMessage } from "./errors";
/** Structured sync keeps facts locally; never show raw API diagnostics as guidance. */
export function workoutSyncError(error: unknown): string {
  if (axios.isAxiosError(error) && error.response?.status === 409) return "План или запись изменились на сервере. Изменения и результаты сохранены на устройстве; автоматическая перезапись остановлена";
  const message = toUserMessage(error, "Не удалось отправить запись");
  return message.includes("на устройстве") ? message : `${message} Изменения и результаты сохранены на устройстве`;
}
