import { useEffect, useState } from "react";

import type { AdminExercise } from "@/api/adminExercises";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";

type Props = {
  exercise: AdminExercise | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
};

export function RejectExerciseMediaDialog({ exercise, busy, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState("");
  const dialogRef = useModalAccessibility(Boolean(exercise), onClose);

  useEffect(() => setReason(""), [exercise?.id]);
  if (!exercise) return null;

  const valid = reason.trim().length >= 5;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-3 sm:items-center sm:justify-center" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="reject-media-title" tabIndex={-1} className="w-full max-w-lg rounded-2xl bg-tg-bg p-4 shadow-xl">
        <h2 id="reject-media-title" className="text-lg font-semibold">GIF неверный</h2>
        <p className="mt-1 text-sm text-tg-hint">{exercise.name_ru}</p>
        <p className="mt-3 text-sm">Анимация и её миниатюра сразу исчезнут из пользовательской карточки. Укажите, что именно показано неверно.</p>
        <label className="mt-3 block text-xs text-tg-hint">
          Причина
          <textarea data-autofocus rows={4} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Например: показано другое оборудование или другое движение" className="mt-1 w-full rounded-xl border border-black/10 bg-tg-secondary px-3 py-2 text-base text-tg-text" />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-xl bg-tg-secondary px-3 text-sm disabled:opacity-50">Отмена</button>
          <button type="button" disabled={busy || !valid} onClick={() => void onSubmit(reason.trim())} className="min-h-11 rounded-xl bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Снимаем…" : "Снять GIF"}</button>
        </div>
      </div>
    </div>
  );
}
