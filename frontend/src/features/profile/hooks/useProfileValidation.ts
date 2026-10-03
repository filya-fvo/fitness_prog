import { useEffect, useId, useState } from "react";
import { ageFromBirthDate, MANUAL_CALORIE_TARGET_MIN, MANUAL_CALORIE_TARGET_MAX } from "@/utils/energyTargets";

const LABELS = {
  height: "Рост, см", age: "Возраст", birthDate: "Дата рождения",
  targetWeight: "Желаемый вес, кг (необязательно)", manualCalorieTarget: "Цель калорий на день",
};
type Field = keyof typeof LABELS;
type Values = Record<Field, string> & { sex: string };

export function useProfileValidation(values: Values) {
  const prefix = useId();
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitted, setSubmitted] = useState<Values | null>(null);
  useEffect(() => {
    const first = Object.keys(errors)[0];
    if (first) document.getElementById(`${prefix}-${first}`)?.focus();
  }, [errors, prefix]);

  function validate() {
    const next: Partial<Record<Field, string>> = {};
    const height = Number(values.height);
    const age = ageFromBirthDate(values.birthDate) ?? Number(values.age);
    const target = values.targetWeight ? Number(values.targetWeight) : null;
    if (height < 80 || height > 250) next.height = "Укажите рост от 80 до 250 см";
    if (age < 10 || age > 100) next[values.birthDate ? "birthDate" : "age"] = "Укажите возраст от 10 до 100 лет";
    if (target != null && (target < 20 || target > 500)) next.targetWeight = "Укажите вес от 20 до 500 кг";
    const calories = Number(values.manualCalorieTarget);
    if (values.sex === "unspecified" && (calories < MANUAL_CALORIE_TARGET_MIN || calories > MANUAL_CALORIE_TARGET_MAX)) {
      next.manualCalorieTarget = "Укажите от 800 до 10 000 ккал";
    }
    setSubmitted({ ...values });
    setErrors(next);
    if (!Object.keys(next).length) return null;
    return next.height || next.age || next.birthDate || next.targetWeight
      ? "Проверьте рост и возраст: значения вне допустимого диапазона"
      : "Укажите ручную цель калорий от 800 до 10 000 ккал";
  }

  function feedback(field: Field) {
    if (!submitted || submitted[field] !== values[field]) return undefined;
    if ((field === "age" || field === "birthDate")
      && (submitted.age !== values.age || submitted.birthDate !== values.birthDate)) return undefined;
    if (field === "manualCalorieTarget" && submitted.sex !== values.sex) return undefined;
    return errors[field];
  }

  return {
    validate,
    fieldProps: (field: Field) => ({
      id: `${prefix}-${field}`, "aria-label": LABELS[field],
      "aria-invalid": Boolean(feedback(field)),
      "aria-describedby": feedback(field) ? `${prefix}-${field}-error` : undefined,
    }),
    feedbackProps: (field: Field) => ({ id: `${prefix}-${field}-error`, error: feedback(field) }),
  };
}
