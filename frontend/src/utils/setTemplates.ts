export type SetTemplate = {
  id: string;
  label: string;
  sets: number;
  reps: string;
  restSec: number;
};

export const SET_TEMPLATES: SetTemplate[] = [
  { id: "hypertrophy", label: "3×8–12", sets: 3, reps: "8-12", restSec: 75 },
  { id: "strength", label: "5×5", sets: 5, reps: "5", restSec: 150 },
  { id: "volume", label: "4×10", sets: 4, reps: "10", restSec: 90 },
  { id: "endurance", label: "3×15", sets: 3, reps: "12-15", restSec: 45 },
];

export function defaultSetTemplate(): SetTemplate {
  return SET_TEMPLATES[0]!;
}
