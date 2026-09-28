import { enumLabel } from "@/utils/localization";
import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";

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

export function MuscleGroupFilter({ groups, value, onChange, kind, onKindChange }: MuscleGroupFilterProps) {
  if (!groups.length) return null;
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
      <div className="flex gap-2 overflow-x-auto pb-2">
        {groups.slice(0, 8).map((group) => {
          const selected = value === group;
          const label = enumLabel(group);
          return (
            <button
              key={group}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? "" : group)}
              className={[
                "app-card app-card-interactive flex min-h-[94px] min-w-[66px] flex-col items-center justify-center gap-1 px-1 py-2 text-center text-[11px]",
                selected
                  ? "app-card-ember border-[var(--app-brand-mid)] text-tg-text"
                  : "app-card-ocean text-tg-hint",
              ].join(" ")}
            >
              <span aria-hidden="true" className="grid h-12 w-12 place-items-center text-[var(--app-brand-mid)]">
                <MuscleGroupIcon group={group} className="h-10 w-8" />
              </span>
              <span className="w-full truncate">{label}</span>
            </button>
          );
        })}
      </div>
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
