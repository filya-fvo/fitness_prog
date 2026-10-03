export function DraftRecoveryNotice({ dirty, onDiscard, disabled = false, available = true }: {
  dirty: boolean;
  onDiscard: () => void;
  disabled?: boolean;
  available?: boolean;
}) {
  return dirty ? <div className="app-card mb-3 flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
    <p>{available ? "Черновик сохранён на устройстве." : "Не удалось сохранить черновик. Не закрывайте форму."}</p>
    <button type="button" disabled={disabled} onClick={onDiscard} className="min-h-11 rounded-xl px-3 text-tg-link disabled:opacity-50">Отменить изменения</button>
  </div> : null;
}
