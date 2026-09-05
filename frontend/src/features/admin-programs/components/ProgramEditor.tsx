import type { ProgramDraft } from "../programDraft";
import { copyProgramDay, moveItem } from "../programDraft";
import { ProgramDayEditor } from "./ProgramDayEditor";

type Props = {
  draft: ProgramDraft;
  busy: boolean;
  onChange: (draft: ProgramDraft) => void;
  onSave: () => void;
  onCancel: () => void;
};

const inputClass = "min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 py-2 text-base";
const equipmentOptions = ["bodyweight", "bands", "dumbbells", "barbell", "machines"];
const limitationOptions = ["no_knee", "no_spine", "shoulder_sensitive"];
const equipmentLabels: Record<string, string> = {
  bodyweight: "Собственный вес", bands: "Резинки", dumbbells: "Гантели",
  barbell: "Штанга", machines: "Тренажёры",
};
const limitationLabels: Record<string, string> = {
  no_knee: "Без нагрузки на колени", no_spine: "Без осевой нагрузки",
  shoulder_sensitive: "Чувствительные плечи",
};
const workoutTypeLabels: Record<string, string> = {
  full_body: "Всё тело", full_body_alt: "Всё тело — чередование",
  upper_lower: "Верх / низ", push_pull_legs: "Жим / тяга / ноги",
  home_express: "Домашняя экспресс", strength: "Сила", hypertrophy: "Масса",
  mobility: "Мобильность", conditioning: "Выносливость", custom: "Своя",
};

function key(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function toggle(items: string[], value: string): string[] {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

export function ProgramEditor({ draft, busy, onChange, onSave, onCancel }: Props) {
  function addDay() {
    onChange({
      ...draft,
      days: [...draft.days, {
        key: key(),
        name: `День ${draft.days.length + 1}`,
        focus: "",
        exercises: [],
        source: {},
      }],
    });
  }

  return (
    <div className="space-y-4 rounded-2xl bg-tg-secondary p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="font-semibold">Редактор черновика</h2><p className="mt-1 text-xs text-tg-hint">Изменения станут видны пользователям только после проверки и публикации.</p></div>
        <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 text-sm text-tg-link disabled:opacity-50">Закрыть</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-tg-hint">Название
          <input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} className={inputClass} maxLength={200} />
        </label>
        <label className="grid gap-1 text-xs text-tg-hint">Длительность, недель
          <input type="number" min={1} max={52} value={draft.durationWeeks} onChange={(event) => onChange({ ...draft, durationWeeks: Number(event.target.value) })} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs text-tg-hint">Тип
          <select value={draft.workoutType} onChange={(event) => onChange({ ...draft, workoutType: event.target.value })} className={inputClass}>
            {Object.entries(workoutTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-tg-hint">Уровень
          <select value={draft.level} onChange={(event) => onChange({ ...draft, level: event.target.value })} className={inputClass}>
            <option value="beginner">Новичок</option><option value="intermediate">Средний</option><option value="advanced">Продвинутый</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-tg-hint">Место
          <select value={draft.location} onChange={(event) => onChange({ ...draft, location: event.target.value })} className={inputClass}>
            <option value="gym">Зал</option><option value="home">Дом</option><option value="outdoor">Улица</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-tg-hint">Для кого
          <select value={draft.sex[0] || "any"} onChange={(event) => onChange({ ...draft, sex: [event.target.value] })} className={inputClass}>
            <option value="any">Для всех</option><option value="unisex">Универсальная</option><option value="male">Мужчины</option><option value="female">Женщины</option>
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-xs text-tg-hint">Описание
        <textarea value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} className={`${inputClass} min-h-24 resize-y`} maxLength={3000} />
      </label>
      <fieldset><legend className="text-xs text-tg-hint">Инвентарь</legend><div className="mt-2 flex flex-wrap gap-2">{equipmentOptions.map((item) => <button key={item} type="button" aria-pressed={draft.equipment.includes(item)} onClick={() => onChange({ ...draft, equipment: toggle(draft.equipment, item) })} className={`min-h-11 rounded-xl px-3 text-sm ${draft.equipment.includes(item) ? "bg-tg-button text-tg-button-text" : "bg-tg-bg text-tg-hint"}`}>{equipmentLabels[item]}</button>)}</div></fieldset>
      <fieldset><legend className="text-xs text-tg-hint">Ограничения</legend><div className="mt-2 flex flex-wrap gap-2">{limitationOptions.map((item) => <button key={item} type="button" aria-pressed={draft.limitations.includes(item)} onClick={() => onChange({ ...draft, limitations: toggle(draft.limitations, item) })} className={`min-h-11 rounded-xl px-3 text-sm ${draft.limitations.includes(item) ? "bg-tg-button text-tg-button-text" : "bg-tg-bg text-tg-hint"}`}>{limitationLabels[item]}</button>)}</div></fieldset>

      <div className="space-y-4">
        {draft.days.map((day, index) => (
          <ProgramDayEditor
            key={day.key}
            day={day}
            index={index}
            count={draft.days.length}
            onChange={(next) => onChange({ ...draft, days: draft.days.map((item, itemIndex) => itemIndex === index ? next : item) })}
            onMove={(direction) => onChange({ ...draft, days: moveItem(draft.days, index, index + direction) })}
            onCopy={() => onChange({ ...draft, days: [...draft.days.slice(0, index + 1), copyProgramDay(day, key()), ...draft.days.slice(index + 1)] })}
            onRemove={() => onChange({ ...draft, days: draft.days.filter((_, itemIndex) => itemIndex !== index) })}
          />
        ))}
      </div>
      <button type="button" onClick={addDay} className="min-h-11 w-full rounded-xl border border-dashed border-tg-button px-4 text-sm font-medium text-tg-link">Добавить тренировочный день</button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-xl bg-tg-bg px-4 text-sm disabled:opacity-50">Отмена</button>
        <button type="button" disabled={busy || !draft.name.trim()} onClick={onSave} className="min-h-11 rounded-xl bg-tg-button px-4 text-sm font-semibold text-tg-button-text disabled:opacity-50">{busy ? "Сохраняем…" : "Сохранить черновик"}</button>
      </div>
    </div>
  );
}
