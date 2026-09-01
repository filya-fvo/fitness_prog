import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import {
  acceptCompetition,
  changeFriendship,
  createFriendCompetition,
  getCompetitions,
  getFriends,
} from "./social";

describe("social API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("validates friends and regularity scores", async () => {
    vi.spyOn(apiClient, "get")
      .mockResolvedValueOnce({ data: { items: [{ id: "11111111-1111-4111-8111-111111111111", label: "@friend", status: "accepted" }] } })
      .mockResolvedValueOnce({ data: { items: [{
        id: "22222222-2222-4222-8222-222222222222",
        friendship_id: "11111111-1111-4111-8111-111111111111",
        friend_label: "@friend",
        status: "active",
        duration_days: 14,
        start_date: "2026-09-01",
        end_date: "2026-09-14",
        algorithm_version: "regularity_v1",
        created_by_me: true,
        can_accept: false,
        my_score: { score: 100, completed: 2, planned: 2 },
        friend_score: { score: 50, completed: 1, planned: 2 },
      }] } });

    expect((await getFriends())[0]?.label).toBe("@friend");
    expect((await getCompetitions())[0]?.friend_score?.score).toBe(50);
  });

  it("sends explicit competition and friendship actions", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: { ok: true } });
    const friendshipId = "11111111-1111-4111-8111-111111111111";
    const competitionId = "22222222-2222-4222-8222-222222222222";

    await createFriendCompetition(friendshipId, 28);
    await acceptCompetition(competitionId);
    await changeFriendship(friendshipId, "block");

    expect(apiClient.post).toHaveBeenNthCalledWith(1, "/competitions/friend", {
      friendship_id: friendshipId,
      duration_days: 28,
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, `/competitions/${competitionId}/accept`);
    expect(apiClient.post).toHaveBeenNthCalledWith(3, `/friends/${friendshipId}/block`);
  });
});
