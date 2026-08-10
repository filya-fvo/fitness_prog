/**
 * Minimal admin CRUD UI for exercises/programs.
 * P1: media URLs + workout_type/level fields.
 * Access: only configured bot owner (default @Filatov_Slava).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  deleteAdminUser,
  fetchAdminUsers,
  resetAdminUser,
  type AdminUser,
} from "@/api/admin";
import { apiClient, getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { Header } from "@/components/layout/Header";
import { useUserStore } from "@/store/userStore";
import type { Exercise } from "@/types/workout";

const ADMIN_USERNAMES = new Set(
  String(import.meta.env.VITE_ADMIN_TELEGRAM_USERNAMES || "Filatov_Slava")
    .split(",")
    .map((s) => s.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean),
);

function isAdminUser(username: string | null | undefined): boolean {
  const u = (username || "").trim().replace(/^@/, "").toLowerCase();
  return Boolean(u && ADMIN_USERNAMES.has(u));
}

type ProgramRow = {
  id: string;
  name: string;
  description: string | null;
  target_level: string | null;
  duration_weeks: number | null;
  workout_type: string;
  level: string | null;
  video_hint?: string;
};

const WORKOUT_TYPES = [
  "full_body",
  "full_body_alt",
  "upper_lower",
  "push_pull_legs",
  "home_express",
  "strength",
  "hypertrophy",
  "mobility",
  "conditioning",
  "custom",
];

export function AdminPage() {
  const user = useUserStore((s) => s.user);
  const isAuthLoading = useUserStore((s) => s.isAuthLoading);
  const allowed = useMemo(() => isAdminUser(user?.username), [user?.username]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingExId, setEditingExId] = useState<string | null>(null);
  const [tab, setTab] = useState<"users" | "content">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [userQ, setUserQ] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [okNote, setOkNote] = useState<string | null>(null);

  const [exName, setExName] = useState("");
  const [exGroup, setExGroup] = useState("ноги");
  const [exVideo, setExVideo] = useState("");
  const [exMediaSource, setExMediaSource] = useState("none");
  const [exThumb, setExThumb] = useState("");

  const [progName, setProgName] = useState("");
  const [progType, setProgType] = useState("full_body");
  const [progLevel, setProgLevel] = useState("beginner");

  async function reload() {
    if (!getStoredToken()) {
      setError("Нужен JWT (войдите через Telegram auth).");
      return;
    }
    setError(null);
    const ex = await fetchExercises({ pageSize: 200 });
    setExercises(ex.items);
    const { data } = await apiClient.get("/programs");
    setPrograms(
      (data.items as Array<Record<string, unknown>>).map((item) => ({
        id: String(item.id),
        name: String(item.name),
        description: (item.description as string | null) ?? null,
        target_level: (item.target_level as string | null) ?? null,
        duration_weeks: (item.duration_weeks as number | null) ?? null,
        workout_type: String(item.workout_type || "custom"),
        level: (item.level as string | null) ?? null,
      })),
    );
  }

  useEffect(() => {
    if (isAuthLoading || !allowed) return;
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    });
    void loadUsers("").catch(() => {
      /* loadUsers sets error */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, isAuthLoading]);

  async function loadUsers(q = userQ) {
    if (!getStoredToken()) {
      setError("Нужен JWT (войдите через Telegram auth).");
      return;
    }
    setUsersLoading(true);
    setError(null);
    try {
      const res = await fetchAdminUsers({ q: q.trim() || undefined, limit: 200 });
      setUsers(res.items);
      setUsersTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить пользователей");
      setUsers([]);
      setUsersTotal(0);
    } finally {
      setUsersLoading(false);
    }
  }

  async function onResetUser(u: AdminUser) {
    const label = u.display_name || u.username || u.id;
    if (!window.confirm(`Очистить профиль «${label}»?\nПользователь пройдёт анкету заново. Придёт уведомление.`)) {
      return;
    }
    setBusy(true);
    setOkNote(null);
    setError(null);
    try {
      const res = await resetAdminUser(u.id, true);
      setOkNote(
        res.notified
          ? `Профиль очищен, уведомление отправлено: ${label}`
          : `Профиль очищен (уведомление не отправлено): ${label}`,
      );
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось очистить профиль");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteUser(u: AdminUser) {
    const label = u.display_name || u.username || u.id;
    if (!window.confirm(`УДАЛИТЬ пользователя «${label}»?\nДействие необратимо. Придёт уведомление.`)) {
      return;
    }
    if (!window.confirm("Точно удалить? Повторное подтверждение.")) return;
    setBusy(true);
    setOkNote(null);
    setError(null);
    try {
      const res = await deleteAdminUser(u.id, true);
      setOkNote(
        res.notified
          ? `Удалён, уведомление отправлено: ${label}`
          : `Удалён (уведомление не отправлено): ${label}`,
      );
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  function fillExerciseForm(item: Exercise) {
    setEditingExId(item.id);
    setExName(item.name_ru);
    setExGroup(item.muscle_group);
    setExVideo(item.video_url || "");
    setExMediaSource(item.media_source || "none");
    setExThumb(item.thumbnail_url || "");
  }

  function resetExerciseForm() {
    setEditingExId(null);
    setExName("");
    setExGroup("ноги");
    setExVideo("");
    setExMediaSource("none");
    setExThumb("");
  }

  async function saveExercise() {
    if (!exName.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name_ru: exName.trim(),
        muscle_group: exGroup.trim() || "общее",
        difficulty: 2,
        video_url: exVideo.trim() || null,
        thumbnail_url: exThumb.trim() || null,
        media_source: exMediaSource || "none",
      };
      if (editingExId) {
        await apiClient.put(`/exercises/${editingExId}`, payload);
      } else {
        await apiClient.post("/exercises", payload);
      }
      resetExerciseForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить упражнение");
    } finally {
      setBusy(false);
    }
  }

  async function deleteExercise(id: string) {
    setBusy(true);
    try {
      await apiClient.delete(`/exercises/${id}`);
      if (editingExId === id) resetExerciseForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить упражнение");
    } finally {
      setBusy(false);
    }
  }

  async function createProgram() {
    if (!progName.trim()) return;
    setBusy(true);
    try {
      await apiClient.post("/programs", {
        name: progName.trim(),
        description: "Создано из простой админки",
        target_level: progLevel,
        level: progLevel,
        workout_type: progType,
        duration_weeks: 4,
        is_template: true,
        structure: {
          workout_type: progType,
          level: progLevel,
          days_per_week: 3,
          schedule: [],
        },
      });
      setProgName("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать программу");
    } finally {
      setBusy(false);
    }
  }

  async function patchProgram(id: string, patch: Record<string, unknown>) {
    setBusy(true);
    try {
      await apiClient.put(`/programs/${id}`, patch);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить программу");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProgram(id: string) {
    setBusy(true);
    try {
      await apiClient.delete(`/programs/${id}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить программу");
    } finally {
      setBusy(false);
    }
  }

  if (isAuthLoading) {
    return (
      <section>
        <Header title="Админка" subtitle="Проверка доступа…" />
        <p className="text-sm text-tg-hint">Авторизация…</p>
      </section>
    );
  }

  if (!allowed) {
    return (
      <section>
        <Header title="Админка" subtitle="Доступ ограничен" />
        <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
          Админка доступна только владельцу бота
          {ADMIN_USERNAMES.size
            ? ` (@${Array.from(ADMIN_USERNAMES).join(", @")})`
            : ""}
          .
          <Link to="/" className="mt-3 block text-center text-tg-link">
            На главную
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Header title="Админка" subtitle="Пользователи · каталог" />
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}
      {okNote ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm text-tg-hint">{okNote}</div> : null}

      <div className="mb-3 flex rounded-full bg-tg-secondary p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setTab("users")}
          className={[
            "flex-1 rounded-full px-3 py-2 font-medium",
            tab === "users" ? "bg-tg-button text-tg-button-text" : "text-tg-hint",
          ].join(" ")}
        >
          Пользователи ({usersTotal || users.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("content")}
          className={[
            "flex-1 rounded-full px-3 py-2 font-medium",
            tab === "content" ? "bg-tg-button text-tg-button-text" : "text-tg-hint",
          ].join(" ")}
        >
          Каталог
        </button>
      </div>

      {tab === "users" ? (
        <div className="mb-6 space-y-3 rounded-2xl bg-tg-secondary p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">Зарегистрированные</h2>
            <button
              type="button"
              disabled={usersLoading || busy}
              onClick={() => void loadUsers()}
              className="text-xs text-tg-link disabled:opacity-50"
            >
              {usersLoading ? "…" : "Обновить"}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={userQ}
              onChange={(e) => setUserQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadUsers(userQ);
              }}
              placeholder="Поиск: фамилия, @логин, email, tg id"
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={usersLoading}
              onClick={() => void loadUsers(userQ)}
              className="shrink-0 rounded-xl bg-tg-button px-3 py-2 text-xs font-semibold text-tg-button-text"
            >
              Найти
            </button>
          </div>
          <p className="text-[11px] text-tg-hint">
            Всего: {usersTotal}. Очистка — анкета заново + push. Удаление — soft-delete + push.
          </p>
          {usersLoading && !users.length ? (
            <p className="text-sm text-tg-hint">Загрузка…</p>
          ) : null}
          {!usersLoading && users.length === 0 ? (
            <p className="text-sm text-tg-hint">Пользователей нет</p>
          ) : null}
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
            {users.map((u) => (
              <li key={u.id} className="rounded-xl bg-tg-bg px-3 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{u.display_name}</p>
                    <p className="mt-0.5 text-[11px] text-tg-hint">
                      {u.username ? `@${u.username.replace(/^@/, "")}` : "без логина"}
                      {u.telegram_id != null ? ` · tg ${u.telegram_id}` : ""}
                      {u.auth_email ? ` · ${u.auth_email}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-tg-hint">
                      {u.onboarding_completed ? "анкета ✓" : "анкета не пройдена"}
                      {` · ${u.subscription_status || "free"}`}
                      {` · тр. ${u.completed_workouts}/${u.workouts_count}`}
                      {u.level ? ` · ${u.level}` : ""}
                      {u.primary_goal ? ` · ${u.primary_goal}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onResetUser(u)}
                      className="text-[11px] text-tg-link disabled:opacity-50"
                    >
                      Очистить
                    </button>
                    <button
                      type="button"
                      disabled={busy || u.id === user?.id}
                      onClick={() => void onDeleteUser(u)}
                      className="text-[11px] text-red-500/90 disabled:opacity-40"
                      title={u.id === user?.id ? "Нельзя удалить себя" : "Удалить"}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={tab === "content" ? "space-y-6" : "hidden"}>
        <div className="rounded-2xl bg-tg-secondary p-4">
          <h2 className="font-medium">
            Упражнения {editingExId ? "(редактирование)" : "(создание)"}
          </h2>
          <div className="mt-3 grid gap-2">
            <input
              value={exName}
              onChange={(e) => setExName(e.target.value)}
              placeholder="Название"
              className="rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
            <input
              value={exGroup}
              onChange={(e) => setExGroup(e.target.value)}
              placeholder="Группа мышц"
              className="rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
            <select
              value={exMediaSource}
              onChange={(e) => setExMediaSource(e.target.value)}
              className="rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            >
              <option value="none">источник медиа: нет</option>
              <option value="youtube">YouTube</option>
              <option value="external">внешнее</option>
            </select>
            <input
              value={exVideo}
              onChange={(e) => setExVideo(e.target.value)}
              placeholder="ссылка на видео (YouTube / mp4)"
              className="rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
            <input
              value={exThumb}
              onChange={(e) => setExThumb(e.target.value)}
              placeholder="превью (необязательно)"
              className="rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveExercise()}
                className="flex-1 rounded-xl bg-tg-button px-3 py-2 text-sm font-semibold text-tg-button-text"
              >
                {editingExId ? "Сохранить" : "Добавить упражнение"}
              </button>
              {editingExId ? (
                <button
                  type="button"
                  onClick={resetExerciseForm}
                  className="rounded-xl bg-tg-bg px-3 py-2 text-sm"
                >
                  Отмена
                </button>
              ) : null}
            </div>
          </div>
          <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto text-sm">
            {exercises.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="text-left"
                  onClick={() => fillExerciseForm(item)}
                >
                  <span className="font-medium">{item.name_ru}</span>
                  <span className="block text-[11px] text-tg-hint">
                    {item.muscle_group} · {item.media_source || "none"}
                    {item.video_url ? " · video" : ""}
                  </span>
                </button>
                <button
                  type="button"
                  className="shrink-0 text-xs text-tg-link"
                  onClick={() => void deleteExercise(item.id)}
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl bg-tg-secondary p-4">
          <h2 className="font-medium">Программы</h2>
          <div className="mt-3 grid gap-2">
            <input
              value={progName}
              onChange={(e) => setProgName(e.target.value)}
              placeholder="Название программы"
              className="rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
            <select
              value={progType}
              onChange={(e) => setProgType(e.target.value)}
              className="rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            >
              {WORKOUT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={progLevel}
              onChange={(e) => setProgLevel(e.target.value)}
              className="rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            >
              <option value="beginner">новичок</option>
              <option value="intermediate">средний</option>
              <option value="advanced">продвинутый</option>
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void createProgram()}
              className="rounded-xl bg-tg-button px-3 py-2 text-sm font-semibold text-tg-button-text"
            >
              Добавить программу
            </button>
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            {programs.map((item) => (
              <li key={item.id} className="rounded-xl bg-tg-bg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-[11px] text-tg-hint">
                      {item.workout_type} · {item.level || item.target_level || "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-tg-link"
                    onClick={() => void deleteProgram(item.id)}
                  >
                    Удалить
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <select
                    value={item.workout_type}
                    onChange={(e) =>
                      void patchProgram(item.id, {
                        workout_type: e.target.value,
                      })
                    }
                    className="rounded-lg border border-black/10 bg-tg-secondary px-2 py-1 text-xs"
                  >
                    {WORKOUT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <select
                    value={item.level || item.target_level || "beginner"}
                    onChange={(e) =>
                      void patchProgram(item.id, {
                        level: e.target.value,
                        target_level: e.target.value,
                      })
                    }
                    className="rounded-lg border border-black/10 bg-tg-secondary px-2 py-1 text-xs"
                  >
                    <option value="beginner">новичок</option>
                    <option value="intermediate">средний</option>
                    <option value="advanced">продвинутый</option>
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
