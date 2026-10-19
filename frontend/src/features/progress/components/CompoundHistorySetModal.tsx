import { useState } from "react";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import type { WorkoutSet, WorkoutExecutionPart } from "@/types/workout";

export function CompoundHistorySetModal({ row, name, busy, error, onClose, onSave }: {
  row: WorkoutSet; name: string; busy: boolean; error: string | null; onClose: () => void;
  onSave: (parts: WorkoutExecutionPart[], note: string | null) => Promise<void>;
}) {
  const ref = useModalAccessibility(true, () => { if (!busy) onClose(); });
  const [parts, setParts] = useState(() => (row.parts ?? []).map(part => ({ ...part })));
  const [note, setNote] = useState(row.note ?? "");
  const patch = (ordinal: number, value: Partial<WorkoutExecutionPart>) => setParts(current => current.map(part => part.ordinal === ordinal ? { ...part, ...value } : part));
  const input = "min-h-11 w-full rounded-xl border border-tg-hint/30 bg-tg-bg px-2 text-base text-tg-text";
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 sm:items-center"><div ref={ref} role="dialog" aria-modal="true" aria-labelledby="compound-history-title" tabIndex={-1}
    className="app-card max-h-[90dvh] w-full max-w-lg overflow-y-auto p-4 text-tg-text"><form className="space-y-3" onSubmit={event => { event.preventDefault(); void onSave(parts, note || null); }}>
    <div className="flex items-center justify-between gap-2"><h3 id="compound-history-title" className="font-semibold">{row.execution_kind === "cluster" ? "Кластер" : "Дроп-сет"} · подход {row.set_number}</h3><button type="button" disabled={busy} className="min-h-11 px-2 text-sm text-tg-link" onClick={onClose}>Закрыть</button></div>
    <p className="text-sm text-tg-hint">{name}{row.weight_mode === "per_hand" ? " · вес одной гантели" : " · полный рабочий вес"}</p>
    {error ? <p role="alert" className="text-sm text-red-500">{error}</p> : null}
    <fieldset disabled={busy} className="space-y-3">{parts.map(part => <section key={part.id} className="app-card-inset space-y-2 p-3" aria-label={`Часть ${part.ordinal}`}>
      <label className="block text-sm">Часть {part.ordinal}<select className={`${input} mt-1`} aria-label={`Статус части ${part.ordinal}`} value={part.status} onChange={event => patch(part.ordinal, { status: event.target.value as WorkoutExecutionPart["status"] })}><option value="completed">Выполнена</option><option value="pending">Не выполнена</option><option value="skipped">Пропущена</option></select></label>
      <div className="grid grid-cols-2 gap-2"><label className="text-sm text-tg-hint">Повторы<input className={`${input} mt-1`} aria-label={`Повторы части ${part.ordinal}`} type="number" inputMode="numeric" min={1} max={100000} required={part.status === "completed"} value={part.reps ?? ""} onChange={event => patch(part.ordinal, { reps: event.target.value ? Number(event.target.value) : null })} /></label>
      <label className="text-sm text-tg-hint">Вес, кг<input className={`${input} mt-1`} aria-label={`Вес части ${part.ordinal}`} type="number" inputMode="decimal" min={0.01} max={10000} step="0.01" required={part.status === "completed"} value={part.weight ?? ""} onChange={event => patch(part.ordinal, { weight: event.target.value ? Number(event.target.value) : null })} /></label></div>
    </section>)}
    <label className="block text-sm text-tg-hint">Заметка<textarea className={`${input} mt-1`} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></label>
    <button type="submit" className="app-gradient-action min-h-12 w-full rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-40">{busy ? "Сохраняем…" : "Сохранить части"}</button></fieldset>
  </form></div></div>;
}
