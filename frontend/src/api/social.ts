import { z } from "zod";

import { apiClient } from "@/api/client";

const friendSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  status: z.enum(["accepted", "blocked"]),
});

const scoreSchema = z.object({
  score: z.number().nullable(),
  completed: z.number().int().nonnegative(),
  planned: z.number().int().nonnegative(),
});

const competitionSchema = z.object({
  id: z.string().uuid(),
  friendship_id: z.string().uuid(),
  friend_label: z.string().min(1),
  status: z.enum(["pending", "active", "finished", "cancelled"]),
  duration_days: z.union([z.literal(14), z.literal(28)]),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  algorithm_version: z.string(),
  created_by_me: z.boolean(),
  can_accept: z.boolean(),
  my_score: scoreSchema.nullable(),
  friend_score: scoreSchema.nullable(),
});

const globalLeaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  alias: z.string().min(1),
  score: z.number().min(0).max(100),
  completed: z.number().int().nonnegative(),
  planned: z.number().int().nonnegative(),
  is_me: z.boolean(),
});

const globalSeasonSchema = z.object({
  season_key: z.string().min(1),
  title: z.string().min(1),
  start_date: z.string(),
  end_date: z.string(),
  join_deadline: z.string(),
  status: z.enum(["not_joined", "joined", "left"]),
  algorithm_version: z.string().min(1),
  cohort: z.enum(["days_1_2", "days_3", "days_4_plus"]),
  cohort_label: z.string().min(1),
  participant_count: z.number().int().nonnegative(),
  minimum_cohort_size: z.number().int().positive(),
  ranking_unlocked: z.boolean(),
  ranked_eligible: z.boolean(),
  provisional: z.boolean(),
  my_alias: z.string().nullable(),
  my_rank: z.number().int().positive().nullable(),
  my_score: scoreSchema.nullable(),
  leaderboard: z.array(globalLeaderboardEntrySchema),
});

export type Friend = z.infer<typeof friendSchema>;
export type Competition = z.infer<typeof competitionSchema>;
export type GlobalSeason = z.infer<typeof globalSeasonSchema>;

export async function getFriends(): Promise<Friend[]> {
  const { data } = await apiClient.get("/friends");
  return z.object({ items: z.array(friendSchema) }).parse(data).items;
}

export async function getCompetitions(): Promise<Competition[]> {
  const { data } = await apiClient.get("/competitions");
  return z.object({ items: z.array(competitionSchema) }).parse(data).items;
}

export async function createFriendCompetition(
  friendshipId: string,
  durationDays: 14 | 28,
): Promise<void> {
  await apiClient.post("/competitions/friend", {
    friendship_id: friendshipId,
    duration_days: durationDays,
  });
}

export async function acceptCompetition(competitionId: string): Promise<void> {
  await apiClient.post(`/competitions/${competitionId}/accept`);
}

export async function leaveCompetition(competitionId: string): Promise<void> {
  await apiClient.post(`/competitions/${competitionId}/leave`);
}

export async function changeFriendship(
  friendshipId: string,
  action: "remove" | "block" | "unblock",
): Promise<void> {
  await apiClient.post(`/friends/${friendshipId}/${action}`);
}

export async function getGlobalSeason(): Promise<GlobalSeason> {
  const { data } = await apiClient.get("/competitions/global/current");
  return globalSeasonSchema.parse(data);
}

export async function joinGlobalSeason(): Promise<void> {
  await apiClient.post("/competitions/global/current/join");
}

export async function leaveGlobalSeason(): Promise<void> {
  await apiClient.post("/competitions/global/current/leave");
}
