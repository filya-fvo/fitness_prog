import { useEffect, useMemo, useState } from "react";

import { ExerciseThumbnail } from "@/features/workout/components/ExerciseThumbnail";
import type { Exercise } from "@/types/workout";
import { rankEquivalentExercises } from "@/utils/exerciseAlternatives";
import { enumLabel } from "@/utils/localization";

type Mode = "recommended" | "catalog";
type SortOrder = "name" | "muscle" | "difficulty";

type Props = {
  source: Exercise;
  catalog: Exercise[];
  occupiedIds: Set<string>;
  onBack: () => void;
  onChoose: (exercise: Exercise) => void;
  onOpenDetail: (exercise: Exercise) => void;
};

const PAGE_SIZE = 30;

function matchesQuery(exercise: Exercise, query: string): boolean {
  if (!query) return true;
  return [exercise.name_ru, exercise.muscle_group, exercise.equipment || "", exercise.description || ""]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

export function PlannedExercisePicker({
  source,
  catalog,
  occupiedIds,
  onBack,
  onChoose,
  onOpenDetail,
}: Props) {
  const [mode, setMode] = useState<Mode>("recommended");
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("name");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const normalizedQuery = query.trim().toLowerCase();
  const muscleGroups = useMemo(
    () => Array.from(new Set(catalog.map((item) => item.muscle_group).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "ru")),
    [catalog],
  );
  const equipmentOptions = useMemo(
    () => Array.from(new Set(catalog.map((item) => item.equipment || "").filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "ru")),
    [catalog],
  );

  const recommended = useMemo(
    () => rankEquivalentExercises(source, catalog, { excludedIds: occupiedIds })
      .filter((item) => matchesQuery(item, normalizedQuery)),
    [catalog, normalizedQuery, occupiedIds, source],
  );
  const fullCatalog = useMemo(() => {
    const rows = catalog.filter((item) => {
      if (item.id === source.id || occupiedIds.has(item.id)) return false;
      if (muscle && item.muscle_group !== muscle) return false;
      if (equipment && item.equipment !== equipment) return false;
      if (difficulty && item.difficulty !== Number(difficulty)) return false;
      return matchesQuery(item, normalizedQuery);
    });
    return [...rows].sort((a, b) => {
      if (sortOrder === "difficulty") {
        return a.difficulty - b.difficulty || a.name_ru.localeCompare(b.name_ru, "ru");
      }
      if (sortOrder === "muscle") {
        return a.muscle_group.localeCompare(b.muscle_group, "ru") ||
          a.name_ru.localeCompare(b.name_ru, "ru");
      }
      return a.name_ru.localeCompare(b.name_ru, "ru");
    });
  }, [catalog, difficulty, equipment, muscle, normalizedQuery, occupiedIds, sortOrder, source.id]);

  useEffect(() => setVisibleCount(PAGE_SIZE), [difficulty, equipment, mode, muscle, normalizedQuery, sortOrder]);

  const candidates = mode === "recommended" ? recommended : fullCatalog;
  const visibleCandidates = candidates.slice(0, visibleCount);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-2 min-h-[44px] text-sm text-tg-link">
        ← К плану
      </button>

      <div className="flex items-center gap-3 rounded-xl bg-tg-secondary p-3">
        <ExerciseThumbnail exercise={source} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-tg-hint">Заменяем</p>
          <p className="break-words text-sm font-semibold">{source.name_ru}</p>
          <p className="mt-0.5 text-[11px] text-tg-hint">
            {enumLabel(source.muscle_group)}{source.equipment ? ` · ${enumLabel(source.equipment)}` : ""}
          </p>
          <button type="button" onClick={() => onOpenDetail(source)} className="mt-1 min-h-[32px] text-xs text-tg-link">
            Посмотреть технику
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 rounded-xl bg-tg-secondary p-1" role="group" aria-label="Режим выбора замены">
        <button
          type="button"
          aria-pressed={mode === "recommended"}
          onClick={() => setMode("recommended")}
          className={`min-h-[44px] rounded-lg px-2 text-xs font-medium ${mode === "recommended" ? "bg-tg-button text-tg-button-text" : "text-tg-hint"}`}
        >
          Рекомендуемые
        </button>
        <button
          type="button"
          aria-pressed={mode === "catalog"}
          onClick={() => setMode("catalog")}
          className={`min-h-[44px] rounded-lg px-2 text-xs font-medium ${mode === "catalog" ? "bg-tg-button text-tg-button-text" : "text-tg-hint"}`}
        >
          Весь каталог
        </button>
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={mode === "recommended" ? "Поиск среди рекомендаций" : "Поиск по всему каталогу"}
        className="mt-3 w-full rounded-xl bg-tg-secondary px-3 py-3 text-base"
      />

      {mode === "catalog" ? (
        <>
          <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
            Свободный выбор может изменить целевую мышечную группу. Подходы и повторы исходного упражнения сохранятся.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-tg-hint">
              Группа мышц
              <select value={muscle} onChange={(event) => setMuscle(event.target.value)} className="mt-1 w-full rounded-xl bg-tg-secondary px-2 py-2 text-base text-tg-text">
                <option value="">Все группы</option>
                {muscleGroups.map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-tg-hint">
              Оборудование
              <select value={equipment} onChange={(event) => setEquipment(event.target.value)} className="mt-1 w-full rounded-xl bg-tg-secondary px-2 py-2 text-base text-tg-text">
                <option value="">Любое</option>
                {equipmentOptions.map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-tg-hint">
              Сложность
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="mt-1 w-full rounded-xl bg-tg-secondary px-2 py-2 text-base text-tg-text">
                <option value="">Любая</option>
                {[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item} из 5</option>)}
              </select>
            </label>
            <label className="text-[11px] text-tg-hint">
              Сортировка
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)} className="mt-1 w-full rounded-xl bg-tg-secondary px-2 py-2 text-base text-tg-text">
                <option value="name">По названию</option>
                <option value="muscle">По группе</option>
                <option value="difficulty">По сложности</option>
              </select>
            </label>
          </div>
        </>
      ) : null}

      <p className="mt-3 text-[11px] text-tg-hint">Найдено: {candidates.length}</p>
      <div className="mt-2 space-y-2">
        {visibleCandidates.map((item) => (
          <div key={item.id} className="flex min-h-[68px] items-center gap-2 rounded-xl bg-tg-secondary p-2">
            <button type="button" onClick={() => onOpenDetail(item)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={`Посмотреть ${item.name_ru}`}>
              <ExerciseThumbnail exercise={item} size="sm" />
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium">{item.name_ru}</span>
                <span className="block text-[11px] text-tg-hint">
                  {enumLabel(item.muscle_group)}{item.equipment ? ` · ${enumLabel(item.equipment)}` : ""} · {item.difficulty}/5
                </span>
              </span>
            </button>
            <button type="button" onClick={() => onChoose(item)} className="min-h-[44px] shrink-0 rounded-lg bg-tg-button px-3 text-xs font-semibold text-tg-button-text">
              Выбрать
            </button>
          </div>
        ))}
        {!candidates.length ? (
          <p className="rounded-xl bg-tg-secondary p-3 text-xs text-tg-hint">
            Ничего не найдено. Измените поиск или фильтры.
          </p>
        ) : null}
      </div>
      {visibleCandidates.length < candidates.length ? (
        <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="mt-3 min-h-[44px] w-full rounded-xl bg-tg-secondary text-sm text-tg-link">
          Показать ещё · осталось {candidates.length - visibleCandidates.length}
        </button>
      ) : null}
    </div>
  );
}
