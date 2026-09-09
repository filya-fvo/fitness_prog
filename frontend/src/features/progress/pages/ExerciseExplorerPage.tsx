import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  fetchExercise,
  fetchExerciseExplorer,
  type ExerciseExplorerItem,
  type ExerciseExplorerScope,
} from "@/api/exercises";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { ExercisePinButton } from "@/features/progress/components/ExercisePinButton";
import { PlusAccessSummary } from "@/features/subscription/components/PlusAccessSummary";
import { hasPlus } from "@/features/subscription/subscriptionAccess";
import { ExerciseDetailModal } from "@/features/workout/components/ExerciseDetailModal";
import { ExerciseThumbnail } from "@/features/workout/components/ExerciseThumbnail";
import { useUserStore } from "@/store/userStore";
import type { Exercise } from "@/types/workout";
import { toUserMessage } from "@/utils/errors";
import { enumLabel } from "@/utils/localization";

const SCOPES: { value: ExerciseExplorerScope; label: string }[] = [
  { value: "recent", label: "Недавние" },
  { value: "pinned", label: "Закреплённые" },
  { value: "all", label: "Все" },
];

function dateLabel(value: string | null): string {
  if (!value) return "Ещё не выполнялось";
  return `Последний раз ${new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`))}`;
}

export function ExerciseExplorerPage() {
  const plusAccess = useUserStore((state) => hasPlus(state.user));
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedExerciseId = searchParams.get("exercise");
  const [scope, setScope] = useState<ExerciseExplorerScope>(linkedExerciseId ? "all" : "recent");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [items, setItems] = useState<ExerciseExplorerItem[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!plusAccess) {
      setLoading(false);
      return;
    }
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    void fetchExerciseExplorer({ scope, muscleGroup, q: debouncedQuery })
      .then((result) => {
        if (requestId.current !== currentRequest) return;
        setItems(result.items);
        setGroups(result.muscleGroups);
        setTotal(result.total);
        setPage(1);
      })
      .catch((err: unknown) => {
        if (requestId.current === currentRequest) {
          setError(toUserMessage(err, "Не удалось загрузить упражнения"));
        }
      })
      .finally(() => {
        if (requestId.current === currentRequest) setLoading(false);
      });
  }, [debouncedQuery, muscleGroup, plusAccess, scope]);

  useEffect(() => {
    if (!plusAccess || !linkedExerciseId || selected?.id === linkedExerciseId) return;
    let cancelled = false;
    void fetchExercise(linkedExerciseId)
      .then((exercise) => { if (!cancelled) setSelected(exercise); })
      .catch(() => {
        if (!cancelled) {
          setError("Упражнение из ссылки больше недоступно");
          const next = new URLSearchParams(searchParams);
          next.delete("exercise");
          setSearchParams(next, { replace: true });
        }
      });
    return () => { cancelled = true; };
  }, [linkedExerciseId, plusAccess, searchParams, selected?.id, setSearchParams]);

  function openExercise(exercise: Exercise) {
    setSelected(exercise);
    const next = new URLSearchParams(searchParams);
    next.set("exercise", exercise.id);
    setSearchParams(next, { replace: true });
  }

  function closeExercise() {
    setSelected(null);
    const next = new URLSearchParams(searchParams);
    next.delete("exercise");
    setSearchParams(next, { replace: true });
  }

  async function loadMore() {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    setError(null);
    try {
      const nextPage = page + 1;
      const result = await fetchExerciseExplorer({
        page: nextPage,
        scope,
        muscleGroup,
        q: debouncedQuery,
      });
      setItems((current) => [...current, ...result.items]);
      setPage(nextPage);
    } catch (err) {
      setError(toUserMessage(err, "Не удалось загрузить ещё упражнения"));
    } finally {
      setLoadingMore(false);
    }
  }

  function updatePinned(exerciseId: string, pinned: boolean) {
    const removingFromPinned = scope === "pinned" && !pinned;
    setItems((current) => removingFromPinned
      ? current.filter((row) => row.id !== exerciseId)
      : current.map((row) => row.id === exerciseId ? { ...row, isPinned: pinned } : row));
    if (removingFromPinned) setTotal((current) => Math.max(0, current - 1));
  }

  if (!plusAccess) {
    return <section className="mx-auto max-w-4xl"><Header title="Упражнения" subtitle="История и динамика" /><PlusAccessSummary feature="exercise_history" /></section>;
  }

  return (
    <section className="mx-auto max-w-4xl">
      <Header title="Упражнения" subtitle="Найдите движение и откройте его динамику" fallbackTo="/progress" />

      <div className="mb-3 rounded-2xl bg-tg-secondary p-3">
        <label className="block text-xs font-medium text-tg-hint">
          Поиск упражнения
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Например, жим гантелей" className="mt-1 min-h-11 w-full rounded-xl bg-tg-bg px-3 text-base" />
        </label>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Раздел упражнений">
          {SCOPES.map((item) => <button key={item.value} type="button" onClick={() => setScope(item.value)} aria-pressed={scope === item.value} className={["min-h-11 shrink-0 rounded-full px-4 text-xs font-semibold", scope === item.value ? "bg-tg-button text-tg-button-text" : "bg-tg-bg text-tg-text"].join(" ")}>{item.label}</button>)}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Группа мышц">
          <button type="button" onClick={() => setMuscleGroup("")} aria-pressed={!muscleGroup} className={["min-h-11 shrink-0 rounded-full px-3 text-xs", !muscleGroup ? "bg-tg-button/20 text-tg-link" : "bg-tg-bg"].join(" ")}>Все группы</button>
          {groups.map((group) => <button key={group} type="button" onClick={() => setMuscleGroup(group)} aria-pressed={muscleGroup === group} className={["min-h-11 shrink-0 rounded-full px-3 text-xs", muscleGroup === group ? "bg-tg-button/20 text-tg-link" : "bg-tg-bg"].join(" ")}>{enumLabel(group)}</button>)}
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-tg-hint">
        <span>{loading ? "Ищем…" : `Найдено: ${total}`}</span>
        <Link to="/progress" className="inline-flex min-h-11 items-center px-2 text-tg-link">К общему прогрессу</Link>
      </div>
      {loading ? <PageSkeleton cards={4} /> : null}
      {error ? <p role="status" className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm text-amber-300">{error}</p> : null}
      {!loading && !items.length ? <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint"><p>{scope === "pinned" ? "Пока ничего не закреплено. Откройте «Недавние» или «Все» и нажмите звёздочку." : scope === "recent" ? "После первой завершённой тренировки здесь появятся недавние упражнения." : "По этим условиям упражнения не найдены."}</p>{scope !== "all" ? <button type="button" onClick={() => setScope("all")} className="mt-3 min-h-11 text-tg-link">Показать все упражнения</button> : null}</div> : null}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => <article key={item.id} className="flex items-start gap-3 rounded-2xl bg-tg-secondary p-3"><ExerciseThumbnail exercise={item} /><button type="button" onClick={() => openExercise(item)} className="min-h-11 min-w-0 flex-1 text-left"><span className="block text-sm font-semibold leading-snug">{item.name_ru}</span><span className="mt-1 block text-[11px] text-tg-hint">{enumLabel(item.muscle_group)} · {dateLabel(item.lastCompletedDate)}</span>{item.completedWorkouts > 0 ? <span className="mt-1 block text-[10px] text-tg-hint">Тренировок с упражнением: {item.completedWorkouts}</span> : null}</button><ExercisePinButton exerciseId={item.id} initialPinned={item.isPinned} compact onChange={(pinned) => updatePinned(item.id, pinned)} /></article>)}
      </div>
      {items.length < total ? <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="mt-4 min-h-11 w-full rounded-xl bg-tg-secondary px-4 text-sm font-semibold text-tg-link disabled:opacity-50">{loadingMore ? "Загружаем…" : `Показать ещё · осталось ${total - items.length}`}</button> : null}

      {selected ? <ExerciseDetailModal exercise={selected} onClose={closeExercise} showExplorerLink={false} /> : null}
    </section>
  );
}
