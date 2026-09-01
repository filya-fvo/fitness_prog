import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import {
  acceptCompetition,
  changeFriendship,
  createFriendCompetition,
  getCompetitions,
  getFriends,
  getGlobalSeason,
  joinGlobalSeason,
  leaveGlobalSeason,
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

  it("validates a privacy-safe global season and sends opt-in actions", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {
      season_key: "regularity-2026-08-31",
      title: "Регулярность · 31 августа — 27 сентября",
      start_date: "2026-08-31",
      end_date: "2026-09-27",
      join_deadline: "2026-09-06",
      status: "joined",
      algorithm_version: "regularity_global_v1",
      cohort: "days_3",
      cohort_label: "3 тренировки в неделю",
      participant_count: 20,
      minimum_cohort_size: 20,
      ranking_unlocked: true,
      ranked_eligible: true,
      provisional: false,
      my_alias: "Участник A1B2C3D4",
      my_rank: 1,
      my_score: { score: 100, completed: 2, planned: 2 },
      leaderboard: [{
        rank: 1,
        alias: "Участник A1B2C3D4",
        score: 100,
        completed: 2,
        planned: 2,
        is_me: true,
      }],
    } });
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: { ok: true } });

    const season = await getGlobalSeason();
    await joinGlobalSeason();
    await leaveGlobalSeason();

    expect(season.leaderboard[0]?.alias).toBe("Участник A1B2C3D4");
    expect(apiClient.post).toHaveBeenNthCalledWith(1, "/competitions/global/current/join");
    expect(apiClient.post).toHaveBeenNthCalledWith(2, "/competitions/global/current/leave");
  });
});
