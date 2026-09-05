import { useState } from "react";

import { listAdminExercises, type AdminExercise } from "@/api/adminExercises";
import { toUserMessage } from "@/utils/errors";

type Props = {
  selectedIds: Set<string>;
  onPick: (exercise: AdminExercise) => void;
};

export function ProgramExercisePicker({ selectedIds, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AdminExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminExercises({
        page: 1,
        pageSize: 20,
        q: query.trim() || undefined,
      });
      setItems(result.items);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось найти упражнения."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-black/10 bg-tg-bg p-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void search(); }}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-black/10 bg-tg-secondary px-3 text-base"
          placeholder="Название упражнения"
          aria-label="Поиск упражнения"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => void search()}
          className="min-h-11 rounded-xl bg-tg-button px-4 text-sm font-semibold text-tg-button-text disabled:opacity-50"
        >
          {loading ? "…" : "Найти"}
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-red-500">{error}</p> : null}
      {items.length ? (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {items.map((item) => {
            const selected = selectedIds.has(item.id);
            const media = item.thumbnail_url || item.animation_url;
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-xl bg-tg-secondary p-2">
                {media ? (
                  <img src={media} alt="" className="h-12 w-12 rounded-lg object-cover" loading="lazy" />
                ) : (
                  <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-lg bg-tg-bg text-lg">🏋️</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name_ru}</p>
                  <p className="truncate text-xs text-tg-hint">{item.muscle_group}{item.equipment ? ` · ${item.equipment}` : ""}</p>
                </div>
                <button
                  type="button"
                  disabled={selected}
                  onClick={() => onPick(item)}
                  className="min-h-11 rounded-lg px-3 text-sm font-medium text-tg-link disabled:text-tg-hint"
                >
                  {selected ? "Добавлено" : "Добавить"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
