import { useId, useState } from "react";

import { validProgramNumber } from "./programNumbers";

type Props = { label: string; value: string; min: number; max: number; onChange: (value: string) => void; presets?: number[] };
export function ProgramNumberField({ label, value, min, max, onChange, presets }: Props) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const valid = validProgramNumber(value, min, max);
  const showError = !valid && !editing;
  function adjust(delta: number) {
    // An explicit action may replace an incomplete draft, while typing never does.
    const current = valid ? Number(value) : min;
    onChange(String(Math.max(min, Math.min(max, current + delta))));
  }
  return <div className="min-w-0">
    <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
    <div className="mt-1 flex gap-2">
      <button type="button" aria-label={`Уменьшить: ${label}`} disabled={valid && Number(value) === min} onClick={() => adjust(-1)} className="app-button app-secondary-action min-h-11 min-w-11 text-base">−</button>
      <input id={id} type="text" inputMode="numeric" value={value} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} onChange={(event) => onChange(event.target.value)} aria-invalid={!valid} aria-describedby={showError ? `${id}-error` : undefined} className="app-field min-h-11 min-w-0 flex-1 text-base" />
      <button type="button" aria-label={`Увеличить: ${label}`} disabled={valid && Number(value) === max} onClick={() => adjust(1)} className="app-button app-secondary-action min-h-11 min-w-11 text-base">+</button>
    </div>
    {showError ? <p id={`${id}-error`} role="alert" className="app-field-error mt-1">{label}: введите целое число от {min} до {max}.</p> : null}
    {presets ? <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Быстрый выбор: ${label}`}>
      {presets.map((preset) => <button key={preset} type="button" aria-pressed={valid && Number(value) === preset} onClick={() => onChange(String(preset))} className="app-chip app-card-inset min-h-11 min-w-11 px-3 text-base">{preset === 0 ? "Без отдыха" : preset}</button>)}
    </div> : null}
  </div>;
}
