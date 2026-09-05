import type { ChangeEvent } from "react";

import type {
  AdminExerciseOptions,
  ExerciseMediaUploadField,
  ExercisePreflight,
} from "@/api/adminExercises";
import { resolveApiAssetUrl } from "@/api/client";

import type { ExerciseDraft } from "../exerciseDraft";

type Props = {
  draft: ExerciseDraft;
  options: AdminExerciseOptions;
  editing: boolean;
  busy: boolean;
  preflight: ExercisePreflight | null;
  onChange: (next: ExerciseDraft) => void;
  onCheck: () => void;
  onSave: () => void;
  onUploadMedia: (field: ExerciseMediaUploadField, file: File) => Promise<void>;
  onCancel: () => void;
};

const inputClass = "min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 py-2 text-base";
const labelClass = "grid gap-1 text-xs text-tg-hint";

export function ExerciseEditorForm({
  draft,
  options,
  editing,
  busy,
  preflight,
  onChange,
  onCheck,
  onSave,
  onUploadMedia,
  onCancel,
}: Props) {
  const set = <K extends keyof ExerciseDraft>(key: K, value: ExerciseDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };
  const rawPreview = draft.animationUrl.trim() || draft.thumbnailUrl.trim();
  const preview = resolveApiAssetUrl(rawPreview) ?? rawPreview;
  const upload = async (
    field: ExerciseMediaUploadField,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) await onUploadMedia(field, file);
  };

  return (
    <div className="space-y-4 rounded-2xl bg-tg-secondary p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{editing ? "Редактирование" : "Новое упражнение"}</h2>
          <p className="mt-1 text-xs text-tg-hint">Проверка медиа и дублей выполняется до сохранения.</p>
        </div>
        {editing ? <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 text-sm text-tg-link disabled:opacity-50">Отмена</button> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>Название *
          <input required value={draft.name} onChange={(event) => set("name", event.target.value)} className={inputClass} maxLength={200} />
        </label>
        <label className={labelClass}>Основная группа мышц *
          <input required list="admin-muscle-groups" value={draft.muscleGroup} onChange={(event) => set("muscleGroup", event.target.value)} className={inputClass} maxLength={100} />
          <datalist id="admin-muscle-groups">{options.muscle_groups.map((item) => <option key={item} value={item} />)}</datalist>
        </label>
        <label className={labelClass}>Дополнительные группы
          <input value={draft.secondaryMuscles} onChange={(event) => set("secondaryMuscles", event.target.value)} className={inputClass} placeholder="трицепс, плечи" />
        </label>
        <label className={labelClass}>Оборудование
          <input list="admin-equipment" value={draft.equipment} onChange={(event) => set("equipment", event.target.value)} className={inputClass} maxLength={100} />
          <datalist id="admin-equipment">{options.equipment.map((item) => <option key={item} value={item} />)}</datalist>
        </label>
        <label className={labelClass}>Уровень сложности
          <select value={draft.difficulty} onChange={(event) => set("difficulty", event.target.value)} className={inputClass}>
            {[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item} из 5</option>)}
          </select>
        </label>
        <label className={labelClass}>Правило учёта веса
          <select value={draft.weightRule} onChange={(event) => set("weightRule", event.target.value as ExerciseDraft["weightRule"])} className={inputClass}>
            <option value="total">Общий вес</option>
            <option value="per_hand">Одна гантель</option>
            <option value="per_side">Каждая сторона</option>
            <option value="none">Без веса</option>
          </select>
        </label>
      </div>

      <label className={labelClass}>Теги через запятую
        <input value={draft.tags} onChange={(event) => set("tags", event.target.value)} className={inputClass} placeholder="curated, gymvisual" />
      </label>
      <label className={labelClass}>Ограничения и противопоказания
        <textarea value={draft.limitations} onChange={(event) => set("limitations", event.target.value)} className={`${inputClass} min-h-24 resize-y`} placeholder="Каждое ограничение с новой строки" />
      </label>
      <label className={labelClass}>Описание
        <textarea value={draft.description} onChange={(event) => set("description", event.target.value)} className={`${inputClass} min-h-24 resize-y`} />
      </label>
      <label className={labelClass}>Техника выполнения
        <textarea value={draft.technique} onChange={(event) => set("technique", event.target.value)} className={`${inputClass} min-h-32 resize-y`} />
      </label>
      <label className={labelClass}>Подсказки и частые ошибки
        <textarea value={draft.commonMistakes} onChange={(event) => set("commonMistakes", event.target.value)} className={`${inputClass} min-h-24 resize-y`} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>Источник медиа
          <select value={draft.mediaSource} onChange={(event) => set("mediaSource", event.target.value as ExerciseDraft["mediaSource"])} className={inputClass}>
            <option value="none">Локальное / нет</option>
            <option value="youtube">YouTube</option>
            <option value="external">Внешний файл</option>
          </select>
        </label>
        <label className={labelClass}>Длительность, сек.
          <input inputMode="numeric" value={draft.mediaDuration} onChange={(event) => set("mediaDuration", event.target.value.replace(/\D/g, ""))} className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>GIF / анимация
        <input value={draft.animationUrl} onChange={(event) => set("animationUrl", event.target.value)} className={inputClass} placeholder="/exercise-gifs/…gif" maxLength={2000} />
      </label>
      <label className={labelClass}>Thumbnail
        <input value={draft.thumbnailUrl} onChange={(event) => set("thumbnailUrl", event.target.value)} className={inputClass} placeholder="/exercise-thumbnails/…png" maxLength={2000} />
      </label>
      <label className={labelClass}>Видео
        <input value={draft.videoUrl} onChange={(event) => set("videoUrl", event.target.value)} className={inputClass} placeholder="https://…" maxLength={2000} />
      </label>

      <div className="grid gap-3 rounded-xl bg-tg-bg p-3 sm:grid-cols-2">
        <label className={labelClass}>Загрузить основное медиа
          <input
            type="file"
            accept="image/gif,image/webp,image/png,image/jpeg"
            disabled={!editing || busy}
            onChange={(event) => void upload("animation_url", event)}
            className="min-h-11 w-full text-sm file:mr-2 file:min-h-11 file:rounded-lg file:border-0 file:bg-tg-button file:px-3 file:text-tg-button-text disabled:opacity-50"
          />
          <span>GIF, WebP, PNG или JPEG · до 25 МБ.</span>
        </label>
        <label className={labelClass}>Загрузить миниатюру
          <input
            type="file"
            accept="image/webp,image/png,image/jpeg"
            disabled={!editing || busy}
            onChange={(event) => void upload("thumbnail_url", event)}
            className="min-h-11 w-full text-sm file:mr-2 file:min-h-11 file:rounded-lg file:border-0 file:bg-tg-button file:px-3 file:text-tg-button-text disabled:opacity-50"
          />
          <span>{editing ? "WebP, PNG или JPEG · до 5 МБ." : "Сначала сохраните упражнение."}</span>
        </label>
      </div>

      {preview ? (
        <div className="overflow-hidden rounded-xl bg-tg-bg p-3">
          <p className="mb-2 text-xs text-tg-hint">Предпросмотр до сохранения</p>
          <img src={preview} alt={`Предпросмотр: ${draft.name || "упражнение"}`} className="mx-auto max-h-64 rounded-lg object-contain" />
        </div>
      ) : null}
      {draft.videoUrl ? <a href={draft.videoUrl} target="_blank" rel="noreferrer" className="block min-h-11 rounded-xl bg-tg-bg px-3 py-3 text-center text-sm text-tg-link">Открыть видео для проверки</a> : null}

      {preflight ? (
        <div className={`rounded-xl p-3 text-sm ${preflight.valid ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-600 dark:text-red-300"}`}>
          <p className="font-medium">{preflight.valid ? "Проверка пройдена" : "Нужно исправить"}</p>
          {preflight.errors.map((item) => <p key={item} className="mt-1">{item}</p>)}
          {preflight.duplicates.length ? <div className="mt-2 text-tg-text"><p className="text-xs text-tg-hint">Возможные дубли:</p>{preflight.duplicates.map((item) => <p key={item.id}>{item.name_ru} · {Math.round(item.similarity * 100)}%</p>)}</div> : null}
          {preflight.media.map((item) => <p key={item.field} className="mt-1 text-xs">{item.field}: {item.message}{item.size_bytes ? ` · ${(item.size_bytes / 1024).toFixed(0)} КБ` : ""}</p>)}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={busy || !draft.name.trim() || !draft.muscleGroup.trim()} onClick={onCheck} className="min-h-11 rounded-xl bg-tg-bg px-4 text-sm font-semibold text-tg-link disabled:opacity-50">Проверить</button>
        <button type="button" disabled={busy || !draft.name.trim() || !draft.muscleGroup.trim()} onClick={onSave} className="min-h-11 rounded-xl bg-tg-button px-4 text-sm font-semibold text-tg-button-text disabled:opacity-50">{busy ? "Проверяем…" : editing ? "Проверить и сохранить" : "Проверить и добавить"}</button>
      </div>
    </div>
  );
}
