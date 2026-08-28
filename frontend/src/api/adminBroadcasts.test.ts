import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import {
  cancelAdminBroadcast,
  launchAdminBroadcast,
  previewBroadcastAudience,
  retryAdminBroadcast,
} from "./adminBroadcasts";

vi.mock("./client", () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

const campaign = {
  id: "11111111-1111-4111-8111-111111111111",
  actor_user_id: "22222222-2222-4222-8222-222222222222",
  title: "Проверка",
  message_text: "Сообщение",
  audience: { kind: "all_telegram" },
  status: "tested",
  counts: { expected: 2, pending: 0, sending: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0 },
  failure_reasons: [],
  tested_at: "2026-08-27T10:00:00Z",
  scheduled_at: null,
  scheduled_timezone: "Europe/Moscow",
  started_at: null,
  completed_at: null,
  cancelled_at: null,
  retry_count: 0,
  created_at: "2026-08-27T09:00:00Z",
  updated_at: "2026-08-27T10:00:00Z",
};

describe("admin broadcasts API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("previews an allowlisted audience", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { expected_count: 12 } });
    await expect(previewBroadcastAudience({ kind: "active", days: 14 })).resolves.toBe(12);
    expect(apiClient.post).toHaveBeenCalledWith(
      "/admin/broadcasts/audience-preview",
      { kind: "active", days: 14 },
      { signal: undefined },
    );
  });

  it("sends the expected count and explicit launch phrase", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: campaign });
    await launchAdminBroadcast(campaign.id, {
      expectedCount: 2, confirmationText: "РАЗОСЛАТЬ 2",
      scheduledTimezone: "Europe/Moscow",
    });
    expect(apiClient.post).toHaveBeenCalledWith(`/admin/broadcasts/${campaign.id}/launch`, {
      confirmed: true,
      confirmation_text: "РАЗОСЛАТЬ 2",
      expected_recipient_count: 2,
      scheduled_at: null,
      scheduled_timezone: "Europe/Moscow",
    });
  });

  it("retries only the failed count with an explicit phrase", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: campaign });
    await retryAdminBroadcast(campaign.id, 3);
    expect(apiClient.post).toHaveBeenCalledWith(`/admin/broadcasts/${campaign.id}/retry`, {
      confirmed: true, confirmation_text: "ПОВТОРИТЬ 3",
    });
  });

  it("cancels only the selected campaign", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { ...campaign, status: "cancelled" } });
    await cancelAdminBroadcast(campaign.id);
    expect(apiClient.post).toHaveBeenCalledWith(`/admin/broadcasts/${campaign.id}/cancel`);
  });
});
