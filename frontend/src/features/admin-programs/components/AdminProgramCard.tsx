import type { Program } from "@/types/workout";
import { enumLabel, programDayLabel } from "@/utils/localization";

type Props = {
  program: Program;
  focused: boolean;
  busy: boolean;
  onEdit: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onRollback: () => void;
  onDelete: () => void;
};

function statusLabel(program: Program): string {
  if (program.publication_status === "draft") return "Черновик";
  if (program.publication_status === "archived") return "Архив";
  return program.is_current ? "Опубликована" : "Предыдущая версия";
}

export function AdminProgramCard({ program, focused, busy, onEdit, onPreview, onPublish, onRollback, onDelete }: Props) {
  const schedule = Array.isArray(program.structure.schedule) ? program.structure.schedule : [];
  return (
    <li id={`admin-program-${program.id}`} className={`rounded-2xl bg-tg-secondary p-4 ${focused ? "ring-2 ring-tg-button" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{programDayLabel(program.name)}</h2>
          <p className="mt-1 text-xs text-tg-hint">{enumLabel(program.workout_type)} · {enumLabel(program.level || program.target_level, "Уровень не указан")} · {schedule.length} дн.</p>
          <p className="mt-1 text-xs text-tg-hint">{statusLabel(program)} · версия {program.version ?? 1}</p>
        </div>
        <button type="button" disabled={busy} onClick={onDelete} className="min-h-11 shrink-0 text-sm text-red-500 disabled:opacity-40">
          {program.publication_status === "draft" ? "Удалить" : "В архив"}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" disabled={busy} onClick={onPreview} className="min-h-11 rounded-xl bg-tg-bg px-3 text-sm text-tg-link disabled:opacity-40">Предпросмотр</button>
        <button type="button" disabled={busy || program.publication_status === "archived"} onClick={onEdit} className="min-h-11 rounded-xl bg-tg-bg px-3 text-sm text-tg-link disabled:opacity-40">
          {program.publication_status === "draft" ? "Редактировать" : "Новая версия"}
        </button>
        {program.publication_status === "draft" ? (
          <button type="button" disabled={busy} onClick={onPublish} className="col-span-2 min-h-11 rounded-xl bg-tg-button px-3 text-sm font-semibold text-tg-button-text disabled:opacity-40">Проверить и опубликовать</button>
        ) : null}
        {program.publication_status === "published" && program.is_current && (program.version ?? 1) > 1 ? (
          <button type="button" disabled={busy} onClick={onRollback} className="col-span-2 min-h-11 rounded-xl bg-amber-500/15 px-3 text-sm font-medium text-amber-700 disabled:opacity-40 dark:text-amber-300">Вернуть предыдущую версию</button>
        ) : null}
      </div>
    </li>
  );
}
