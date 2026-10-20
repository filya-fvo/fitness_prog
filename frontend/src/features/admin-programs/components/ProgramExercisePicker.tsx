import { useEffect, useMemo, useState } from "react";

import { mapExercise } from "@/api/exercises";
import type { AdminExercise } from "@/api/adminExercises";
import { fetchAdminExerciseCatalog } from "@/api/adminExerciseCatalog";
import { PlannedExercisePicker } from "@/features/workout/components/PlannedExercisePicker";
import { ExerciseDetailModal } from "@/features/workout/components/ExerciseDetailModal";
import type { Exercise } from "@/types/workout";
import { toUserMessage } from "@/utils/errors";

type Props = { selectedIds: Set<string>; onPick: (exercise: AdminExercise) => void };

export function ProgramExercisePicker({ selectedIds, onPick }: Props) {
  const [items, setItems] = useState<AdminExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState<Exercise | null>(null);
  const catalog = useMemo(() => items.map(mapExercise), [items]);
  const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchAdminExerciseCatalog().then(result => { if (active) setItems(result); })
      .catch((cause: unknown) => { if (active) setError(toUserMessage(cause, "Не удалось загрузить упражнения")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  return <div className="app-card-inset p-3">
    {loading ? <p role="status" className="text-sm text-tg-hint">Загружаем упражнения…</p> : error ? <div role="alert" className="app-status app-status-warning text-sm">
      <p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 text-tg-link">Повторить загрузку упражнений</button>
    </div> : <PlannedExercisePicker source={null} catalog={catalog} occupiedIds={selectedIds} onChoose={item => { const row = byId.get(item.id); if (row && !selectedIds.has(row.id)) onPick(row); }} onOpenDetail={setDetail} collapsibleFilters />}
    {detail ? <ExerciseDetailModal exercise={detail} onClose={() => setDetail(null)} showExplorerLink={false} showProgress={false} /> : null}
  </div>;
}
