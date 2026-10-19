import { useId } from "react";

type Scope = "occurrence" | "program_day";
type Props = { value: Scope; activeScopes?: Scope[]; disabled?: boolean; onChange: (value: Scope) => void; onReset: (scope: Scope) => void };
export function WorkoutCustomizationScope({ value, activeScopes = [], disabled, onChange, onReset }: Props) {
  const name = useId();
  return <div className="mb-3 space-y-2">
    <fieldset disabled={disabled} className="app-card-inset px-3 py-2">
      <legend className="px-1 text-xs font-medium">Применить изменения</legend>
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="radio" name={name} checked={value === "occurrence"} onChange={() => onChange("occurrence")} />Только эта тренировка</label>
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="radio" name={name} checked={value === "program_day"} onChange={() => onChange("program_day")} />Мои следующие тренировки этого дня</label>
    </fieldset>
    {value === "program_day" ? <p className="text-xs text-tg-hint">Подготовка этой даты войдёт в ваш личный план для всех фаз. Другие пользователи сохранят исходную программу.</p> : null}
    {activeScopes.includes("program_day") ? <button type="button" disabled={disabled} onClick={() => onReset("program_day")} className="min-h-[44px] w-full rounded-lg px-2 text-xs text-tg-hint">Сбросить личные изменения дня</button> : null}
    {activeScopes.includes("occurrence") ? <button type="button" disabled={disabled} onClick={() => onReset("occurrence")} className="min-h-[44px] w-full rounded-lg px-2 text-xs text-tg-hint">Сбросить подготовку этой даты</button> : null}
  </div>;
}
