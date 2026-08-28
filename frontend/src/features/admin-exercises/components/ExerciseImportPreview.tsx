import { useState } from "react";

import { previewExerciseImport, type ExerciseImportPreview } from "@/api/adminExercises";
import { toUserMessage } from "@/utils/errors";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function ExerciseImportPreviewPanel() {
  const [source, setSource] = useState("");
  const [result, setResult] = useState<ExerciseImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function preview() {
    setError(null);
    setResult(null);
    try {
      const parsed: unknown = JSON.parse(source);
      if (!Array.isArray(parsed) || !parsed.every(isRecord)) {
        throw new Error("Нужен JSON-массив объектов упражнений.");
      }
      setBusy(true);
      setResult(await previewExerciseImport(parsed));
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось проверить импорт."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-2xl bg-tg-secondary p-4">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">Предварительная проверка импорта</summary>
      <p className="mb-3 text-xs text-tg-hint">Вставьте JSON-массив до 500 упражнений. Проверка ничего не записывает в базу.</p>
      <textarea value={source} onChange={(event) => setSource(event.target.value)} className="min-h-40 w-full resize-y rounded-xl border border-black/10 bg-tg-bg p-3 font-mono text-base" placeholder={'[{"name_ru":"…","muscle_group":"…"}]'} />
      <button type="button" disabled={busy || !source.trim()} onClick={() => void preview()} className="mt-2 min-h-11 w-full rounded-xl bg-tg-button px-4 text-sm font-semibold text-tg-button-text disabled:opacity-50">{busy ? "Проверяем…" : "Проверить без импорта"}</button>
      {error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{error}</p> : null}
      {result ? (
        <div className="mt-3 text-sm">
          <p className="font-medium">Всего {result.total} · готово {result.valid} · с ошибками {result.invalid}</p>
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {result.rows.map((row) => (
              <li key={row.row} className={`rounded-xl p-2 ${row.valid ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                <p>#{row.row} · {row.name_ru || "без названия"}</p>
                {row.errors.map((item) => <p key={item} className="text-xs text-red-600 dark:text-red-300">{item}</p>)}
                {row.duplicates.length ? <p className="text-xs text-tg-hint">Похожие: {row.duplicates.map((item) => item.name_ru).join(", ")}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}
