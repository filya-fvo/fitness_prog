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
import { toUserMessage } from "@/utils/errors";

function actionError(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return toUserMessage(error, "Не удалось выполнить действие. Попробуйте ещё раз.");
}

function formatDay(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function Score({ label, value }: { label: string; value: Competition["my_score"] }) {
  return (
    <div className="rounded-xl bg-tg-bg p-3">
      <p className="truncate text-xs text-tg-hint">{label}</p>
      {value?.score === null || !value ? (
        <p className="mt-1 text-sm font-medium">Пока нет расчёта</p>
      ) : (
        <>
          <p className="mt-1 text-xl font-semibold">{value.score}%</p>
          <p className="text-xs text-tg-hint">{value.completed} из {value.planned} по плану</p>
        </>
      )}
    </div>
  );
}

const statusLabel: Record<Competition["status"], string> = {
  pending: "Ждёт подтверждения",
  active: "Идёт сейчас",
  finished: "Завершено",
  cancelled: "Завершено досрочно",
};

export function SocialPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState("");
  const [duration, setDuration] = useState<14 | 28>(14);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [friendItems, competitionItems] = await Promise.all([
        getFriends(),
        getCompetitions(),
      ]);
      setFriends(friendItems);
      setCompetitions(competitionItems);
      setSelectedFriend((current) =>
        friendItems.some((item) => item.id === current && item.status === "accepted")
          ? current
          : (friendItems.find((item) => item.status === "accepted")?.id ?? ""),
      );
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
      <Header title="Друзья и соревнования" subtitle="Регулярность относительно личного плана" fallbackTo="/more" />

      <div className="mb-4 rounded-2xl bg-tg-secondary p-4 text-sm leading-relaxed text-tg-hint">
        Сравнивается процент выполненных тренировочных дней. Вес, замеры, упражнения и другие личные данные другу не показываются.
      </div>
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

          {acceptedFriends.length > 0 ? (
            <div className="mb-4 rounded-2xl bg-tg-secondary p-4">
              <h2 className="font-semibold">Новое соревнование</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-tg-hint">С кем
                  <select value={selectedFriend} onChange={(event) => setSelectedFriend(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl bg-tg-bg px-3 text-base text-tg-text">
                    {acceptedFriends.map((friend) => <option key={friend.id} value={friend.id}>{friend.label}</option>)}
                  </select>
                </label>
                <label className="text-sm text-tg-hint">Срок
                  <select value={duration} onChange={(event) => setDuration(Number(event.target.value) as 14 | 28)} className="mt-1 min-h-11 w-full rounded-xl bg-tg-bg px-3 text-base text-tg-text">
                    <option value={14}>14 дней</option>
                    <option value={28}>28 дней</option>
                  </select>
                </label>
              </div>
              <button type="button" disabled={!selectedFriend || busy === "create"} onClick={() => void run("create", () => createFriendCompetition(selectedFriend, duration), "Приглашение на соревнование отправлено")} className="mt-3 min-h-11 w-full rounded-xl bg-tg-button px-4 font-semibold text-tg-button-text disabled:opacity-50">Предложить соревнование</button>
            </div>
          ) : null}

          <div className="rounded-2xl bg-tg-secondary p-4">
            <h2 className="font-semibold">Соревнования</h2>
            {competitions.length === 0 ? <p className="mt-2 text-sm text-tg-hint">Активных и завершённых соревнований пока нет.</p> : (
              <div className="mt-3 space-y-3">
                {competitions.map((competition) => (
                  <article key={competition.id} className="rounded-xl bg-tg-bg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><h3 className="truncate text-sm font-semibold">С {competition.friend_label}</h3><p className="mt-1 text-xs text-tg-hint">{competition.duration_days} дней{competition.start_date ? ` · ${formatDay(competition.start_date)}–${formatDay(competition.end_date)}` : ""}</p></div>
                      <span className="shrink-0 rounded-full bg-tg-secondary px-2 py-1 text-xs text-tg-hint">{statusLabel[competition.status]}</span>
                    </div>
                    {competition.status === "active" || competition.status === "finished" ? <div className="mt-3 grid grid-cols-2 gap-2"><Score label="Вы" value={competition.my_score} /><Score label={competition.friend_label} value={competition.friend_score} /></div> : null}
                    {competition.status === "pending" ? <p className="mt-3 text-sm text-tg-hint">{competition.created_by_me ? "Ждём согласия друга." : "Друг предлагает сравнить регулярность. Старт произойдёт только после вашего согласия."}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {competition.can_accept ? <button type="button" disabled={busy === competition.id} onClick={() => void run(competition.id, () => acceptCompetition(competition.id), "Соревнование началось")} className="min-h-11 rounded-xl bg-tg-button px-4 text-sm font-semibold text-tg-button-text disabled:opacity-50">Принять</button> : null}
                      {competition.status === "pending" || competition.status === "active" ? <button type="button" disabled={busy === competition.id} onClick={() => void endCompetition(competition)} className="min-h-11 rounded-xl bg-tg-secondary px-4 text-sm text-red-500 disabled:opacity-50">{competition.status === "pending" ? "Отказаться" : "Выйти"}</button> : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
