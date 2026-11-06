import { useCallback, useEffect, useState } from "react";
import { cancelUnsentWorkoutPreparation, listPendingWorkoutPreparations } from "@/db/workoutCustomization";
import { confirmAction } from "@/lib/telegram";
import { useUserStore } from "@/store/userStore";

type Pending = Awaited<ReturnType<typeof listPendingWorkoutPreparations>>[number];

/** Each cancellation is explicit; queued workouts and uncertain writes stay protected. */
export function PendingPreparationActions() {
  const owner = useUserStore(state => state.user?.id);
  const [items, setItems] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (!owner) { setItems([]); return; }
    try { setItems(await listPendingWorkoutPreparations(owner)); }
    catch { setError("Не удалось проверить сохранённые изменения"); }
  }, [owner]);
  useEffect(() => {
    void refresh();
    const listener = () => { void refresh(); };
    window.addEventListener("fitness:sync-complete", listener);
    window.addEventListener("fitness:native-change", listener);
    const timer = window.setInterval(listener, 10000);
    return () => { window.removeEventListener("fitness:sync-complete", listener); window.removeEventListener("fitness:native-change", listener); window.clearInterval(timer); };
  }, [refresh]);
  const cancel = async (item: Pending) => {
    if (!owner || busy || !await confirmAction(`Отменить неотправленное изменение тренировки на ${item.scheduledDate}?`)) return;
    setBusy(true); setError(null);
    try { await cancelUnsentWorkoutPreparation(item.operationId, owner); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось отменить изменение"); }
    finally { setBusy(false); }
  };
  if (!items.length && !error) return null;
  return <div className="mt-2 space-y-2">
    {items.map(item => <div key={item.operationId} className="flex flex-wrap items-center gap-2">
      <span>Подготовка тренировки на {item.scheduledDate}, день {item.dayIndex}</span>
      <button type="button" disabled={busy} className="app-button app-danger-action min-h-11" onClick={() => void cancel(item)}>Отменить изменение</button>
    </div>)}
    {error && <p role="status">{error}</p>}
  </div>;
}
