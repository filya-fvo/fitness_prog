import { enumLabel } from "@/utils/localization";
import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";

type MuscleGroupFilterProps = {
  groups: string[];
  value: string;
  onChange: (value: string) => void;
};

export function MuscleGroupFilter({ groups, value, onChange }: MuscleGroupFilterProps) {
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
      <div className="grid grid-cols-4 gap-2">
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
                "app-card app-card-interactive flex min-h-[104px] min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-center text-[11px]",
                selected
                  ? "app-card-ember border-[var(--app-brand-mid)] text-tg-text"
                  : "app-card-ocean text-tg-hint",
              ].join(" ")}
            >
              <span aria-hidden="true" className="grid h-14 w-14 place-items-center text-[var(--app-brand-mid)]">
                <MuscleGroupIcon group={group} className="h-12 w-10" />
              </span>
              <span className="w-full truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
