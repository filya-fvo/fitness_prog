import type { AdminAuditFilters } from "@/api/adminAudit";

export const ADMIN_AUDIT_PAGE_SIZE = 30;

const VALUE_LABELS: Record<string, string> = {
  workout_sets: "подходы",
  workouts: "тренировки",
  nutrition_logs: "записи питания",
  daily_metrics: "дневные показатели",
  body_measurements: "замеры тела",
  ai_conversations: "диалоги с тренером",
  email_otp_codes: "коды входа",
  water_days: "дни учёта воды",
  measurements: "замеры",
  weight_days: "дни учёта веса",
};

export function localDateTimeToIso(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function toApiFilters(values: {
  dateFrom: string;
  dateTo: string;
  actorUserId: string;
  query?: string;
  action: string;
  result: string;
}): AdminAuditFilters {
  return {
    dateFrom: localDateTimeToIso(values.dateFrom),
    dateTo: localDateTimeToIso(values.dateTo),
    actorUserId: values.actorUserId || undefined,
    query: values.query?.trim() || undefined,
    action: values.action || undefined,
    result:
      values.result === "success" || values.result === "failure" ? values.result : undefined,
  };
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${VALUE_LABELS[key] || "записи"}: ${formatAuditValue(item)}`)
      .join("; ");
  }
  return String(value);
}
