import type { Exercise } from "@/types/workout";
import { exerciseWeightInput } from "@/utils/exerciseWeightRule";
import { ProgramNumberField } from "../components/ProgramNumberField";
import { validProgramNumber } from "../components/programNumbers";
import type { PersonalExerciseDraft } from "./personalProgramDraft";

type Props = {
  item: PersonalExerciseDraft; exercise?: Exercise; raw: Record<string, string>;
  onChange: (field: "reps_min" | "reps_max" | "target_weight", value: string) => void;
};

export function PersonalGoalFields({ item, exercise, raw, onChange }: Props) {
  const target = item.target;
  if (!target || target.kind === "timed") return null;
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
