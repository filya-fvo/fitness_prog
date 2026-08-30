import { z } from "zod";

import { apiClient } from "@/api/client";

const actorSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
});

const entrySchema = z.object({
  id: z.string().uuid(),
  actor_user_id: z.string().uuid().nullable(),
  actor_label: z.string(),
  action: z.string(),
  object_type: z.string(),
  object_id: z.string().uuid().nullable(),
  result: z.enum(["success", "failure"]),
  description: z.string(),
  before: z.record(z.unknown()),
  after: z.record(z.unknown()),
  notification_status: z.string().nullable(),
  correlation_id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
});

const responseSchema = z.object({
  items: z.array(entrySchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  actors: z.array(actorSchema),
  actions: z.array(z.string()),
});

export type AdminAuditEntry = z.infer<typeof entrySchema>;
export type AdminAuditActor = z.infer<typeof actorSchema>;
export type AdminAuditResponse = z.infer<typeof responseSchema>;
export type AdminAuditResult = "success" | "failure";

export type AdminAuditFilters = {
  dateFrom?: string;
  dateTo?: string;
  actorUserId?: string;
  action?: string;
  result?: AdminAuditResult;
};

export type AdminAuditExportFormat = "csv" | "json";
export type AdminAuditDownload = {
  blob: Blob;
  exportedCount: number;
  totalMatches: number;
  truncated: boolean;
};

function filterPayload(filters: AdminAuditFilters) {
  return {
    date_from: filters.dateFrom || undefined,
    date_to: filters.dateTo || undefined,
    actor_user_id: filters.actorUserId || undefined,
    action: filters.action || undefined,
    result: filters.result || undefined,
  };
}

function nonNegativeHeader(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function fetchAdminAudit(
  filters: AdminAuditFilters,
  options: { limit: number; offset: number },
): Promise<AdminAuditResponse> {
  const { data } = await apiClient.get("/admin/audit", {
    params: {
      ...filterPayload(filters),
      limit: options.limit,
      offset: options.offset,
    },
  });
  return responseSchema.parse(data);
}

export async function downloadAdminAudit(
  filters: AdminAuditFilters,
  format: AdminAuditExportFormat,
): Promise<AdminAuditDownload> {
  const response = await apiClient.post<Blob>(
    "/admin/audit/export",
    filterPayload(filters),
    { params: { format }, responseType: "blob" },
  );
  return {
    blob: response.data,
    exportedCount: nonNegativeHeader(response.headers["x-exported-count"]),
    totalMatches: nonNegativeHeader(response.headers["x-total-count"]),
    truncated: response.headers["x-export-truncated"] === "true",
  };
}
