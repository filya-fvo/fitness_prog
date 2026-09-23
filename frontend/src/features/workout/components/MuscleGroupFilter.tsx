import { enumLabel } from "@/utils/localization";

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
                "flex min-h-[104px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-center text-[11px] active:scale-[0.97]",
                selected
                  ? "border-[var(--app-signal)] bg-[color-mix(in_srgb,var(--app-signal)_10%,var(--app-surface))] text-tg-text"
                  : "border-[var(--border-subtle)] bg-tg-secondary text-tg-hint",
              ].join(" ")}
            >
              <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-inset)] text-lg font-bold text-[var(--app-signal)]">
                {label.slice(0, 1)}
              </span>
              <span className="w-full truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
