import axios from "axios";
import { z } from "zod";

import { apiClient } from "@/api/client";

const adminUserSchema = z.object({
  id: z.string().uuid(),
  telegram_id: z.number().nullable().optional(),
  username: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  display_name: z.string(),
  auth_email: z.string().nullable().optional(),
  subscription_status: z.string().optional().default("free"),
  onboarding_completed: z.boolean().optional().default(false),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  workouts_count: z.number().optional().default(0),
  completed_workouts: z.number().optional().default(0),
  has_water_log: z.boolean().optional().default(false),
  primary_goal: z.string().nullable().optional(),
  level: z.string().nullable().optional(),
});

const listSchema = z.object({
  items: z.array(adminUserSchema),
  total: z.number(),
});

const actionSchema = z.object({
  ok: z.boolean(),
  user_id: z.string().uuid(),
  action: z.string(),
  notified: z.boolean().optional().default(false),
  detail: z.string().nullable().optional(),
  meta: z.record(z.any()).optional().default({}),
});

export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminActionResult = z.infer<typeof actionSchema>;

function adminApiError(err: unknown, fallback: string): Error {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data;
    const detail =
      data && typeof data === "object" && data !== null && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : typeof data === "string" && data.trim().startsWith("<!")
          ? "API proxy: /admin не проксируется (перезапустите Vite)"
          : err.message;
    return new Error(status ? `${fallback} (${status}): ${detail}` : `${fallback}: ${detail}`);
  }
  if (err instanceof z.ZodError) {
    return new Error(`${fallback}: неверный ответ API`);
  }
  if (err instanceof Error) return err;
  return new Error(fallback);
}

export async function fetchAdminUsers(opts?: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: AdminUser[]; total: number }> {
  try {
    const { data } = await apiClient.get("/admin/users", {
      params: {
        q: opts?.q || undefined,
        limit: opts?.limit ?? 100,
        offset: opts?.offset ?? 0,
      },
    });
    return listSchema.parse(data);
  } catch (err) {
    throw adminApiError(err, "Не удалось загрузить пользователей");
  }
}

export async function resetAdminUser(
  userId: string,
  notify = true,
): Promise<AdminActionResult> {
  try {
    const { data } = await apiClient.post(`/admin/users/${userId}/reset`, null, {
      params: { notify },
    });
    return actionSchema.parse(data);
  } catch (err) {
    throw adminApiError(err, "Не удалось очистить профиль");
  }
}

export async function deleteAdminUser(
  userId: string,
  notify = true,
): Promise<AdminActionResult> {
  try {
    const { data } = await apiClient.delete(`/admin/users/${userId}`, {
      params: { notify },
    });
    return actionSchema.parse(data);
  } catch (err) {
    throw adminApiError(err, "Не удалось удалить пользователя");
  }
}
