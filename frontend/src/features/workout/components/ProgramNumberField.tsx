import { useId, useState } from "react";

import { changeProgramTimeUnit, programTimeSeconds, validProgramNumber, validProgramWeight, type ProgramTimeUnit } from "./programNumbers";

type Props = { label: string; ariaLabel?: string; value: string; min: number; max: number; onChange: (value: string) => void; presets?: number[]; weight?: boolean; clearAtZero?: boolean; timeUnit?: ProgramTimeUnit; disabled?: boolean; mixed?: boolean };
export function ProgramNumberField({ label, ariaLabel = label, value, min, max, onChange, presets, weight, clearAtZero, timeUnit, disabled, mixed }: Props) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const seconds = timeUnit ? programTimeSeconds(value, timeUnit) : null;
  const valid = timeUnit ? seconds !== null : weight ? validProgramWeight(value) : validProgramNumber(value, min, max);
  const numeric = timeUnit ? seconds : Number(value);
  const showError = !valid && !editing && !mixed;
  function adjust(delta: number) {
    // An explicit action may replace an incomplete draft, while typing never does.
    if (timeUnit) {
      // Step in integer seconds, then use the same exact finite-unit formatter.
      // The smallest supported finite minute value is 0.05 (three seconds).
      const floor = timeUnit === "minutes" ? 3 : 1;
      const next = Math.max(floor, Math.min(86400, (seconds ?? floor) + delta * (timeUnit === "minutes" ? 60 : 1)));
      onChange(changeProgramTimeUnit(String(next), "seconds", timeUnit)!);
      return;
    }
    const current = valid && value !== "" ? Number(value.replace(",", ".")) : min;
    const next = Math.max(min, Math.min(max, current + delta * (weight ? 0.5 : 1)));
    onChange(weight && clearAtZero && next === 0 ? "" : String(next));
  }
  return <div className="min-w-0">
    <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
    <div className="mt-1 flex gap-2">
      <button type="button" aria-label={`Уменьшить: ${ariaLabel}`} disabled={disabled || (valid && numeric === (timeUnit === "minutes" ? 3 : min))} onClick={() => adjust(-1)} className="app-button app-secondary-action min-h-11 min-w-11 text-base">−</button>
      <input id={id} aria-label={ariaLabel} type="text" inputMode={weight || timeUnit === "minutes" ? "decimal" : "numeric"} placeholder={mixed ? "Разные значения" : weight ? "При выполнении" : undefined} disabled={disabled} value={value} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} onChange={(event) => onChange(event.target.value)} aria-invalid={!valid && !mixed} aria-describedby={showError ? `${id}-error` : undefined} className="app-field min-h-11 min-w-0 flex-1 text-base" />
      <button type="button" aria-label={`Увеличить: ${ariaLabel}`} disabled={disabled || (valid && numeric === max)} onClick={() => adjust(1)} className="app-button app-secondary-action min-h-11 min-w-11 text-base">+</button>
    </div>
    {!valid && !mixed ? <p id={`${id}-error`} role={showError ? "alert" : undefined} aria-hidden={!showError} className={`app-field-error mt-1${editing ? " invisible" : ""}`}>{label}: {timeUnit ? "укажите от 1 до 86400 целых секунд; минуты — до двух знаков, без долей секунды." : weight ? "укажите вес больше 0 и до 10000 или оставьте пустым." : `введите целое число от ${min} до ${max}.`}</p> : null}
    {presets ? <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Быстрый выбор: ${label}`}>
      {presets.map((preset) => <button key={preset} type="button" disabled={disabled} aria-pressed={valid && Number(value) === preset} onClick={() => onChange(String(preset))} className="app-chip app-card-inset min-h-11 min-w-11 px-3 text-base">{preset === 0 ? "Без отдыха" : preset}</button>)}
    </div> : null}
  </div>;
}
