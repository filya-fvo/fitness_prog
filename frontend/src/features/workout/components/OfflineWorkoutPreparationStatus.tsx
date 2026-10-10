export function OfflineWorkoutPreparationStatus({ preparedAt, error }: { preparedAt: string | null; error: string | null }) {
  if (!preparedAt && !error) return null;
  return <p role="status" className="my-2 text-sm text-tg-hint">{error ? `Планы без сети: ${error}` : `Планы сохранены на устройстве · обновлены ${new Date(preparedAt!).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}</p>;
}
