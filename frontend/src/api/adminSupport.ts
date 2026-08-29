import { z } from "zod";

import { apiClient } from "@/api/client";
import { supportCategories, supportStatuses, type SupportCategory, type SupportStatus } from "@/api/support";

const adminSummarySchema = z.object({
  id: z.string().uuid(),
  category: z.enum(supportCategories),
  status: z.enum(supportStatuses),
  subject: z.string(),
  last_message_preview: z.string(),
  unread: z.boolean(),
  last_message_at: z.string().datetime({ offset: true }),
  created_at: z.string().datetime({ offset: true }),
  user_id: z.string().uuid(),
  user_label: z.string(),
});

const messageSchema = z.object({
  id: z.string().uuid(),
  author_type: z.enum(["user", "admin", "system"]),
  body: z.string(),
  delivery_channel: z.enum(["in_app", "telegram"]),
  delivery_status: z.enum(["pending", "sent", "failed", "not_requested", "unavailable"]),
  created_at: z.string().datetime({ offset: true }),
});

const adminDetailSchema = adminSummarySchema.extend({
  source_page: z.string().nullable(),
  client: z.string(),
  app_version: z.string().nullable(),
  messages: z.array(messageSchema),
});

const listSchema = z.object({
  items: z.array(adminSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
  waiting_support: z.number().int().nonnegative(),
});

export type AdminSupportTicket = z.infer<typeof adminSummarySchema>;
export type AdminSupportDetail = z.infer<typeof adminDetailSchema>;
export type AdminSupportList = z.infer<typeof listSchema>;

export async function listAdminSupportTickets(filters: {
  page: number;
  status?: SupportStatus;
  category?: SupportCategory;
}): Promise<AdminSupportList> {
  const { data } = await apiClient.get("/admin/support", { params: { ...filters, page_size: 30 } });
  return listSchema.parse(data);
}

export async function getAdminSupportTicket(ticketId: string): Promise<AdminSupportDetail> {
  const { data } = await apiClient.get(`/admin/support/${ticketId}`);
  return adminDetailSchema.parse(data);
}

export async function replyAdminSupport(ticketId: string, message: string): Promise<void> {
  await apiClient.post(`/admin/support/${ticketId}/messages`, {
    message,
    idempotency_key: crypto.randomUUID(),
  });
}

export async function updateAdminSupportStatus(ticketId: string, status: SupportStatus): Promise<AdminSupportDetail> {
  const { data } = await apiClient.patch(`/admin/support/${ticketId}/status`, { status });
  return adminDetailSchema.parse(data);
}
