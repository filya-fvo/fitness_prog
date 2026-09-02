import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  acceptCompetition,
  changeFriendship,
  createFriendCompetition,
  getCompetitions,
  getFriends,
  leaveCompetition,
  type Competition,
  type Friend,
} from "@/api/social";
import { Header } from "@/components/layout/Header";
import { CompetitionBuilder } from "@/features/social/components/CompetitionBuilder";
import { CompetitionCard } from "@/features/social/components/CompetitionCard";
import { GlobalSeasonCard } from "@/features/social/components/GlobalSeasonCard";
import { toUserMessage } from "@/utils/errors";

function actionError(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return toUserMessage(error, "Не удалось выполнить действие. Попробуйте ещё раз.");
}

export function SocialPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [friendItems, competitionItems] = await Promise.all([
        getFriends(),
        getCompetitions(),
      ]);
      setFriends(friendItems);
      setCompetitions(competitionItems);
    } catch (reason) {
      setError(actionError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const acceptedFriends = useMemo(
    () => friends.filter((friend) => friend.status === "accepted"),
    [friends],
  );

  async function run(key: string, action: () => Promise<void>, success: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await load();
    } catch (reason) {
      setError(actionError(reason));
    } finally {
      setBusy(null);
    }
  }

  async function updateFriend(friend: Friend, action: "remove" | "block" | "unblock") {
    if (
      action !== "unblock"
      && !window.confirm(
        action === "block"
          ? `Заблокировать ${friend.label}? Текущие соревнования завершатся.`
          : `Удалить ${friend.label} из друзей? Текущие соревнования завершатся.`,
      )
    ) return;
    const success = action === "block" ? "Пользователь заблокирован" : action === "remove" ? "Друг удалён" : "Блокировка снята";
    await run(`friend-${friend.id}`, () => changeFriendship(friend.id, action), success);
  }

  async function endCompetition(competition: Competition) {
    const verb = competition.status === "pending" ? "отказаться от предложения" : "выйти из соревнования";
    if (!window.confirm(`Точно ${verb}? Соревнование завершится для обоих.`)) return;
    await run(competition.id, () => leaveCompetition(competition.id), "Соревнование завершено");
  }

  return (
    <section>
      <Header title="Друзья и соревнования" subtitle="Честный прогресс относительно своего старта" fallbackTo="/more" />

      <div className="mb-4 rounded-2xl bg-tg-secondary p-4 text-sm leading-relaxed text-tg-hint">
        Вы сами выбираете срок и до четырёх факторов. Система сравнивает проценты прогресса от личной исходной точки; абсолютный вес и обхваты другу не показываются.
      </div>
      <GlobalSeasonCard />
      {notice ? <div role="status" className="mb-4 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div> : null}
      {error ? <div role="alert" className="mb-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">{error}</div> : null}

      {loading ? <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">Загружаем друзей и соревнования…</div> : (
        <>
          <div className="mb-4 rounded-2xl bg-tg-secondary p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Друзья</h2>
              <Link to="/invite" className="min-h-11 content-center text-sm font-medium text-tg-link">Пригласить</Link>
            </div>
            {friends.length === 0 ? (
              <p className="mt-2 text-sm text-tg-hint">Пока никого нет. Отправьте новую ссылку существующему пользователю.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {friends.map((friend) => (
                  <div key={friend.id} className="rounded-xl bg-tg-bg p-3">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{friend.label}</p>
                      {friend.status === "blocked" ? <span className="text-xs text-red-500">Заблокирован</span> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {friend.status === "blocked" ? (
                        <button type="button" disabled={busy === `friend-${friend.id}`} onClick={() => void updateFriend(friend, "unblock")} className="min-h-11 rounded-xl bg-tg-secondary px-3 text-sm text-tg-link disabled:opacity-50">Разблокировать</button>
                      ) : (
                        <>
                          <button type="button" disabled={busy === `friend-${friend.id}`} onClick={() => void updateFriend(friend, "remove")} className="min-h-11 rounded-xl bg-tg-secondary px-3 text-sm text-tg-link disabled:opacity-50">Удалить</button>
                          <button type="button" disabled={busy === `friend-${friend.id}`} onClick={() => void updateFriend(friend, "block")} className="min-h-11 rounded-xl bg-tg-secondary px-3 text-sm text-red-500 disabled:opacity-50">Заблокировать</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {acceptedFriends.length > 0 ? <CompetitionBuilder
            friends={acceptedFriends}
            busy={busy === "create"}
            onCreate={(input) => run(
              "create",
              () => createFriendCompetition(input.friendshipId, input.durationDays, input.factors, input.title),
              "Приглашение на соревнование отправлено",
            )}
          /> : null}

          <div className="rounded-2xl bg-tg-secondary p-4">
            <h2 className="font-semibold">Соревнования</h2>
            {competitions.length === 0 ? <p className="mt-2 text-sm text-tg-hint">Активных и завершённых соревнований пока нет.</p> : (
              <div className="mt-3 space-y-3">
                {competitions.map((competition) => <CompetitionCard
                  key={competition.id}
                  competition={competition}
                  busy={busy === competition.id}
                  onAccept={() => run(competition.id, () => acceptCompetition(competition.id), "Соревнование началось")}
                  onLeave={() => endCompetition(competition)}
                />)}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
