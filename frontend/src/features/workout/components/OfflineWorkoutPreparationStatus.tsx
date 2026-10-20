type Props = { preparedAt: string | null; error: string | null; tooLarge?: boolean; preparing?: boolean; preparationDays?: number; onPrepareRange?: (days: number) => void };
export function OfflineWorkoutPreparationStatus({ preparedAt, error, tooLarge, preparing, preparationDays = 14, onPrepareRange }: Props) {
  if (!preparedAt && !error && !preparing) return null;
  const choices = [7, 3, 1].filter(days => days < preparationDays);
  return <div role="status" aria-busy={preparing} className="my-2 text-sm text-tg-hint">
    <p>{preparing ? "Сохраняем планы на устройстве…" : error ? `Планы без сети: ${error}` : `Планы сохранены на устройстве · обновлены ${new Date(preparedAt!).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}</p>
    {tooLarge && onPrepareRange ? <>
      <div className="mt-2 flex flex-wrap gap-2">{choices.map(days => <button key={days} type="button" disabled={preparing} className="app-button app-secondary-action min-h-11 px-3 text-base" onClick={() => onPrepareRange(days)}>На {days} {days === 1 ? "день" : days < 5 ? "дня" : "дней"}</button>)}</div>
      {!choices.length ? <p className="mt-1">Откройте нужный день с интернетом, чтобы подготовить упражнения.</p> : null}
    </> : null}
  </div>;
}
