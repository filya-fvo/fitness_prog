import { z } from "zod";

import { apiClient } from "@/api/client";
import { isTelegramEnvironment } from "@/lib/telegram";

export const supportCategories = ["bug", "question", "idea", "other"] as const;
export const supportStatuses = ["waiting_support", "waiting_user", "resolved", "closed"] as const;

const messageSchema = z.object({
  id: z.string().uuid(),
  author_type: z.enum(["user", "admin", "system"]),
  body: z.string(),
  delivery_channel: z.enum(["in_app", "telegram"]),
  delivery_status: z.enum(["pending", "sent", "failed", "not_requested", "unavailable"]),
  created_at: z.string().datetime({ offset: true }),
});

const summarySchema = z.object({
  id: z.string().uuid(),
  category: z.enum(supportCategories),
  status: z.enum(supportStatuses),
  subject: z.string(),
  last_message_preview: z.string(),
  unread: z.boolean(),
  last_message_at: z.string().datetime({ offset: true }),
  created_at: z.string().datetime({ offset: true }),
});

const detailSchema = summarySchema.extend({
  source_page: z.string().nullable(),
  client: z.string(),
  app_version: z.string().nullable(),
  messages: z.array(messageSchema),
});

const listSchema = z.object({ items: z.array(summarySchema), total: z.number().int().nonnegative() });

export type SupportCategory = (typeof supportCategories)[number];
export type SupportStatus = (typeof supportStatuses)[number];
export type SupportMessage = z.infer<typeof messageSchema>;
export type SupportTicketSummary = z.infer<typeof summarySchema>;
export type SupportTicketDetail = z.infer<typeof detailSchema>;

export async function listSupportTickets(): Promise<SupportTicketSummary[]> {
  const { data } = await apiClient.get("/support/tickets");
  return listSchema.parse(data).items;
}

export async function createSupportTicket(input: {
  category: SupportCategory;
  message: string;
  page: string;
}): Promise<SupportTicketSummary> {
  const idempotencyKey = crypto.randomUUID();
  const { data } = await apiClient.post("/support/tickets", {
    category: input.category,
    message: input.message,
    page: input.page,
    client: isTelegramEnvironment() ? "telegram" : "browser",
    app_version: __FITNESS_BUILD_ID__,
    idempotency_key: idempotencyKey,
  });
  return summarySchema.parse(data);
}

export async function getSupportTicket(ticketId: string): Promise<SupportTicketDetail> {
  const { data } = await apiClient.get(`/support/tickets/${ticketId}`);
  return detailSchema.parse(data);
}

export async function sendSupportMessage(ticketId: string, message: string): Promise<SupportMessage> {
  const { data } = await apiClient.post(`/support/tickets/${ticketId}/messages`, {
    message,
    idempotency_key: crypto.randomUUID(),
  });
  return messageSchema.parse(data);
}

export async function closeSupportTicket(ticketId: string): Promise<void> {
  await apiClient.post(`/support/tickets/${ticketId}/close`);
}
