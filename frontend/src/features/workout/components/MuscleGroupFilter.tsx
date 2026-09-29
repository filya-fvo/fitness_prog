import { useState } from "react";

import { enumLabel } from "@/utils/localization";
import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";
import { normalizeMuscleGroup } from "@/utils/muscleGroups";

type MuscleGroupFilterProps = {
  groups: string[];
  value: string;
  onChange: (value: string) => void;
  kind: string;
  onKindChange: (value: string) => void;
};

const kinds = [
  { value: "", label: "Все" },
  { value: "strength", label: "Силовые" },
  { value: "isolation", label: "Изоляция" },
  { value: "bodyweight", label: "С весом тела" },
];
const muscleOrder = ["chest", "back", "legs", "shoulders", "biceps", "abs", "core", "triceps", "glutes", "cardio", "mobility"];

export function MuscleGroupFilter({ groups, value, onChange, kind, onKindChange }: MuscleGroupFilterProps) {
  const [expanded, setExpanded] = useState(false);
  if (!groups.length) return null;
  const rank = (group: string) => {
    const index = muscleOrder.indexOf(normalizeMuscleGroup(group));
    return index < 0 ? muscleOrder.length : index;
  };
  const orderedGroups = [...groups].sort((left, right) => rank(left) - rank(right));
  const showAll = expanded || (value !== "" && !orderedGroups.slice(0, 5).includes(value));
  const visibleGroups = showAll ? orderedGroups.slice(0, 8) : orderedGroups.slice(0, 5);
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="section-kicker">Группы мышц</h2>
        {value ? (
          <button type="button" onClick={() => onChange("")} className="tap-target-x px-2 text-xs text-tg-link">
            Показать все
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {visibleGroups.map((group) => {
          const selected = value === group;
          const label = enumLabel(group);
          return (
            <button
              key={group}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? "" : group)}
              className={[
                "app-card app-card-interactive flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-center text-[10px]",
                selected
                  ? "app-card-ember border-[var(--app-brand-mid)] text-tg-text"
                  : "app-card-ocean text-tg-hint",
              ].join(" ")}
            >
              <span aria-hidden="true" className="grid h-10 w-full place-items-center text-[var(--app-brand-mid)]">
                <MuscleGroupIcon group={group} className="h-9 w-7" />
              </span>
              <span className="w-full truncate">{label}</span>
            </button>
          );
        })}
      </div>
      {groups.length > 5 ? <button type="button" onClick={() => setExpanded((current) => !current)}
        aria-expanded={showAll} className="mt-1 min-h-11 px-1 text-xs font-semibold text-tg-link">
        {showAll ? "Свернуть группы" : `Все группы (${Math.min(groups.length, 8)})`}
      </button> : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {kinds.map((option) => (
          <button key={option.value} type="button" aria-pressed={kind === option.value} onClick={() => onKindChange(option.value)} className={[
            "app-chip min-h-11 px-3 text-xs",
            kind === option.value ? "app-gradient-action text-white" : "app-card-inset text-tg-hint",
          ].join(" ")}>
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
