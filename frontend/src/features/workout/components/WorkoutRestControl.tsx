import { useId, useState } from "react";
import { validProgramNumber } from "./programNumbers";

type Props = { seconds: number; draft?: string; onChange: (value: string) => void };
const PRESETS = [0, 45, 60, 75, 90, 120, 150, 180];

export function WorkoutRestControl({ seconds, draft, onChange }: Props) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const value = draft ?? String(seconds);
  const valid = validProgramNumber(value, 0, 600);
  const showError = !valid && !editing;
  function adjust(delta: number) {
    onChange(String(Math.max(0, Math.min(600, (valid ? Number(value) : 0) + delta))));
  }
  return <div className="rounded-xl bg-tg-bg p-3">
    <div className="mb-2 flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-xs font-medium text-tg-hint">Отдых между подходами</label>
      <p className="text-sm font-semibold tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p>
    </div>
    <div className="flex items-center gap-1">
      {[-15, -30].map(delta => <button key={delta} type="button" onClick={() => adjust(delta)}
        disabled={valid && Number(value) === 0} aria-label={`Уменьшить отдых на ${-delta} секунд`}
        className="min-h-11 min-w-11 rounded-lg bg-tg-secondary text-sm font-semibold disabled:opacity-40">−{-delta}</button>)}
      <input id={id} type="text" inputMode="numeric" value={value} onChange={event => onChange(event.target.value)}
        onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} aria-label="Отдых в секундах"
        aria-invalid={!valid} aria-describedby={showError ? `${id}-error` : undefined}
        className="app-field min-h-11 min-w-0 flex-1 text-center text-base" />
      {[30, 15].map(delta => <button key={delta} type="button" onClick={() => adjust(delta)}
        disabled={valid && Number(value) === 600} aria-label={`Увеличить отдых на ${delta} секунд`}
        className="min-h-11 min-w-11 rounded-lg bg-tg-secondary text-sm font-semibold disabled:opacity-40">+{delta}</button>)}
    </div>
    {showError ? <p id={`${id}-error`} role="alert" className="app-field-error mt-1">Отдых в секундах: введите целое число от 0 до 600.</p> : null}
    <div className="mt-2 flex flex-wrap gap-1.5">
      {PRESETS.map(sec => <button key={sec} type="button" onClick={() => onChange(String(sec))}
        aria-pressed={valid && Number(value) === sec}
        className={`min-h-11 rounded-full px-2.5 py-1 text-xs ${valid && Number(value) === sec ? "app-gradient-action text-white" : "bg-tg-secondary text-tg-hint"}`}>
        {sec === 0 ? "Без отдыха" : sec < 60 ? `${sec}с` : sec % 60 === 0 ? `${sec / 60}м` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`}
      </button>)}
    </div>
    <p className="mt-1.5 text-[10px] text-tg-hint">Применяется к незавершённым подходам этого упражнения.</p>
  </div>;
}
