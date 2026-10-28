import { useState } from "react";
import type { Exercise } from "@/types/workout";
import { exerciseWeightInput } from "@/utils/exerciseWeightRule";
import { ProgramNumberField } from "../components/ProgramNumberField";
import { changeProgramTimeUnit, validProgramNumber, type ProgramTimeUnit } from "../components/programNumbers";
import type { PersonalExerciseDraft } from "./personalProgramDraft";

type Props = {
  item: PersonalExerciseDraft; exercise?: Exercise; raw: Record<string, string>;
  timeUnit?: ProgramTimeUnit;
  onChange: (field: "reps_min" | "reps_max" | "target_weight" | "duration_sec", value: string, unit?: ProgramTimeUnit) => void;
};

export function PersonalGoalFields({ item, exercise, raw, timeUnit = "seconds", onChange }: Props) {
  const target = item.target;
  if (!target) return null;
  if (target.kind === "timed") return <PersonalTimeFields value={raw[`${item.exercise_id}/target/duration_sec`] ?? (timeUnit === "seconds" ? String(target.duration_sec) : "")} unit={timeUnit} onChange={(value, unit) => onChange("duration_sec", value, unit)} />;
  const value = (field: "reps_min" | "reps_max") => raw[`${item.exercise_id}/target/${field}`] ?? String(target[field]);
  const min = value("reps_min"), max = value("reps_max");
  const reversed = validProgramNumber(min, 1, 100000) && validProgramNumber(max, 1, 100000) && Number(min) > Number(max);
  const weight = target.kind === "weight_reps" ? raw[`${item.exercise_id}/target/target_weight`] ?? (target.target_weight === null ? "" : String(target.target_weight)) : "";
  const weightInput = exercise ? exerciseWeightInput(exercise, item.weight_mode) : null;
  return <div className="min-w-0 space-y-3 md:col-span-2">
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold">Повторы</legend>
      <div className="mt-2 grid min-w-0 gap-3 md:grid-cols-2">
        <ProgramNumberField label="От" value={min} min={1} max={100000} onChange={text => onChange("reps_min", text)} />
        <ProgramNumberField label="До" value={max} min={1} max={100000} onChange={text => onChange("reps_max", text)} />
      </div>
      <p role={reversed ? "alert" : undefined} aria-hidden={!reversed} className={`app-field-error mt-1${reversed ? "" : " invisible"}`}>Значение «От» должно быть не больше «До».</p>
    </fieldset>
    {target.kind === "weight_reps" && weightInput ? <div className="min-w-0">
      <p className="mb-2 text-sm font-semibold">Плановый вес</p>
      <ProgramNumberField label={weightInput.label} value={weight} weight clearAtZero min={0} max={10000} onChange={text => onChange("target_weight", text)} />
      {weight === "" ? <p className="mt-1 text-xs text-tg-hint">Укажу при выполнении</p> : null}
      {weightInput.hint ? <p className="mt-1 text-xs text-tg-hint">{weightInput.hint}</p> : null}
    </div> : null}
  </div>;
}

function PersonalTimeFields({ value, unit, onChange }: { value: string; unit: ProgramTimeUnit; onChange: (value: string, unit: ProgramTimeUnit) => void }) {
  const [precisionHint, setPrecisionHint] = useState(false);
  function changeUnit(nextUnit: ProgramTimeUnit) {
    const next = changeProgramTimeUnit(value, unit, nextUnit);
    setPrecisionHint(next === null);
    if (next !== null) onChange(next, nextUnit);
  }
  return <div className="min-w-0 md:col-span-2">
    <div role="group" aria-label="Единица времени работы" className="mb-2 flex flex-wrap gap-2">
      {([['seconds', 'Секунды'], ['minutes', 'Минуты']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={unit === key} onClick={() => changeUnit(key)} className={`app-chip min-h-11 min-w-11 px-3 text-base ${unit === key ? "app-gradient-action" : "app-card-inset"}`}>{label}</button>)}
    </div>
    <ProgramNumberField label="Время работы" value={value} min={1} max={86400} timeUnit={unit} presets={unit === "seconds" ? [30, 60, 90] : [1, 2, 5]} onChange={text => { setPrecisionHint(false); onChange(text, unit); }} />
    {precisionHint ? <p role="status" className="mt-1 text-xs text-tg-hint">Это время нельзя точно показать в минутах. Очистите поле и введите новое время, чтобы сменить единицу.</p> : null}
  </div>;
}
