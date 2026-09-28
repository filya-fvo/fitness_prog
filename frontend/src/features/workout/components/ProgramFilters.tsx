import { useState } from "react";

import { CollapsibleFilterPanel } from "@/components/ui/CollapsibleFilterPanel";
import { enumLabel } from "@/utils/localization";
import { LEVEL_LABELS } from "@/utils/programRecommend";

type Props = {
  search: string;
  onSearch: (value: string) => void;
  sex: string;
  onSex: (value: string) => void;
  location: string;
  onLocation: (value: string) => void;
  level: string;
  onLevel: (value: string) => void;
  limitsOnly: boolean;
  onLimitsOnly: (value: boolean) => void;
  hasProfileLimits: boolean;
  type: string;
  onType: (value: string) => void;
  types: string[];
  count: number;
  onReset: () => void;
};

function FilterOptions({ options, selected, onSelect }: {
  options: Array<{ value: string; label: string }>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  return <div className="flex flex-wrap gap-2">
    {options.map(({ value, label }) => (
      <button key={value || "all"} type="button" aria-pressed={selected === value} onClick={() => onSelect(value)}
        className={selected === value ? "app-chip app-gradient-action min-h-11 px-3 text-xs text-white" : "app-chip app-card-inset min-h-11 px-3 text-xs text-tg-hint"}>
        {label}
      </button>
    ))}
  </div>;
}

export function ProgramFilters(props: Props) {
  const [typesOpen, setTypesOpen] = useState(false);
  const activeCount = [props.search, props.sex, props.location, props.level, props.type].filter(Boolean).length + Number(props.limitsOnly);
  const visibleTypes = typesOpen ? props.types : props.types.slice(0, 4);

  return <CollapsibleFilterPanel
    activeCount={activeCount}
    summary={[props.search ? `«${props.search}»` : "", props.sex === "male" ? "Мужские" : props.sex === "female" ? "Женские" : "", props.location ? enumLabel(props.location) : "", props.type ? enumLabel(props.type) : ""].filter(Boolean).join(" · ") || "Все программы"}>
    <label className="mb-4 block text-xs text-tg-hint">
      Поиск программы
      <input type="search" value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Название или цель"
        className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-tg-secondary px-3 text-base" />
    </label>

    <div className="space-y-4">
      <section aria-label="Для кого">
        <h2 className="mb-2 text-sm font-semibold">Для кого</h2>
        <FilterOptions selected={props.sex} onSelect={props.onSex} options={[
          { value: "", label: "Для всех" }, { value: "male", label: "Мужчинам" }, { value: "female", label: "Женщинам" },
        ]} />
      </section>
      <section aria-label="Место тренировки">
        <h2 className="mb-2 text-sm font-semibold">Место тренировки</h2>
        <FilterOptions selected={props.location} onSelect={props.onLocation} options={[
          { value: "", label: "Любое" }, { value: "gym", label: "Зал" }, { value: "home", label: "Дом" }, { value: "outdoor", label: "Улица" },
        ]} />
      </section>
      <section aria-label="Уровень и ограничения">
        <h2 className="mb-2 text-sm font-semibold">Уровень и ограничения</h2>
        <FilterOptions selected={props.level} onSelect={props.onLevel} options={[
          { value: "", label: "Все уровни" },
          ...["beginner", "intermediate", "advanced"].map((value) => ({ value, label: LEVEL_LABELS[value] || value })),
        ]} />
        {props.hasProfileLimits ? <button type="button" aria-pressed={props.limitsOnly} onClick={() => props.onLimitsOnly(!props.limitsOnly)}
          className={props.limitsOnly ? "app-chip app-gradient-action mt-2 min-h-11 px-3 text-xs text-white" : "app-chip app-card-inset mt-2 min-h-11 px-3 text-xs text-tg-hint"}>
          Только с учётом моих ограничений
        </button> : null}
      </section>
      <section aria-label="Тип программы">
        <h2 className="mb-2 text-sm font-semibold">Тип программы</h2>
        <FilterOptions selected={props.type} onSelect={props.onType} options={[
          { value: "", label: "Все типы" },
          ...visibleTypes.map((value) => ({ value, label: enumLabel(value) })),
        ]} />
        {props.types.length > 4 ? <button type="button" onClick={() => setTypesOpen(!typesOpen)} className="mt-2 min-h-11 text-xs text-tg-link">
          {typesOpen ? "Скрыть типы ↑" : `Показать ещё ${props.types.length - 4} типа ↓`}
        </button> : null}
      </section>
    </div>
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3 text-xs text-tg-hint">
      <span>Найдено программ: {props.count}</span>
      {activeCount ? <button type="button" onClick={props.onReset} className="min-h-11 px-2 text-tg-link">Сбросить фильтры</button> : null}
    </div>
  </CollapsibleFilterPanel>;
}
