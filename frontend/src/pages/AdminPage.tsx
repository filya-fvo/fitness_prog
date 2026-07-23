/**
 * Minimal admin CRUD UI for exercises/programs.
 * P1: media URLs + workout_type/level fields.
 */
import { useEffect, useState } from "react";

import { apiClient, getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { Header } from "@/components/layout/Header";
import type { Exercise } from "@/types/workout";

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
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingExId, setEditingExId] = useState<string | null>(null);

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
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    });
  }, []);

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

  return (
    <section>
      <Header title="Админка" subtitle="CRUD + media / workout_type / level" />
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

      <div className="space-y-6">
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
              <option value="none">media_source: none</option>
              <option value="youtube">youtube</option>
              <option value="external">external</option>
            </select>
            <input
              value={exVideo}
              onChange={(e) => setExVideo(e.target.value)}
              placeholder="video_url (YouTube / mp4)"
              className="rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
            <input
              value={exThumb}
              onChange={(e) => setExThumb(e.target.value)}
              placeholder="thumbnail_url (optional)"
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
              <option value="beginner">beginner</option>
              <option value="intermediate">intermediate</option>
              <option value="advanced">advanced</option>
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
                    <option value="beginner">beginner</option>
                    <option value="intermediate">intermediate</option>
                    <option value="advanced">advanced</option>
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
