import type { PersonalProgramDraft } from "../../src/features/workout/pages/personalProgramDraft";
import type { Exercise } from "../../src/types/workout";

export function maximumPersonalDraft(): PersonalProgramDraft {
  const id = (day: number, row: number) => `11111111-1111-4111-8111-${String(day * 100 + row + 1).padStart(12, "0")}`;
  return {
    name: "Программа".padEnd(80, "\u0000"), location: "outdoor", progression: "linear", durationWeeks: "52", dayCount: 7, activeDay: 6, step: "days",
    days: Array.from({ length: 7 }, (_, day) => {
      const raw: Record<string, string> = {};
      const groups = Array.from({ length: 6 }, (_, group) => {
        const groupId = `22222222-2222-4222-8222-${String(day * 100 + group + 1).padStart(12, "0")}`;
        raw[`${groupId}/rounds`] = "8";
        raw[`${groupId}/transition_sec`] = "600";
        raw[`${groupId}/round_rest_sec`] = "600";
        return { id: groupId, kind: "superset" as const, exercise_ids: [id(day, group * 2), id(day, group * 2 + 1)], rounds: 8, transition_sec: 600, round_rest_sec: 600 };
      });
      const exercises = Array.from({ length: 12 }, (_, row) => {
        const exerciseId = id(day, row);
        raw[`${exerciseId}/target/reps_min`] = "100000";
        raw[`${exerciseId}/target/reps_max`] = "100000";
        raw[`${exerciseId}/target/target_weight`] = "9999.99";
        return {
          exercise_id: exerciseId, sets: "8", reps: "100000-100000".padEnd(20, " "), rest_sec: "300", weight_mode: "per_hand" as const,
          target: { kind: "weight_reps" as const, reps_min: 100000, reps_max: 100000, target_weight: 9999.99 },
          set_methods: Array.from({ length: 8 }, (_, slot) => ({ set_number: slot + 1, kind: "cluster" as const,
            parts: Array.from({ length: 8 }, (_, part) => {
              const pause = part === 7 ? 0 : 600;
              const base = `${exerciseId}/method/${slot + 1}/part/${part + 1}/`;
              raw[`${base}target_reps`] = "100000";
              raw[`${base}target_weight`] = "9999.99";
              raw[`${base}pause_after_sec`] = String(pause);
              return { target_reps: 100000, target_weight: 9999.99, pause_after_sec: pause };
            }),
          })),
        };
      });
      return { name: `День ${day + 1}`.padEnd(80, "\u0000"), exercises, groups, raw };
    }),
  };
}

export function personalDraftCatalog(draft: PersonalProgramDraft): Exercise[] {
  return draft.days.flatMap(day => day.exercises.map(row => ({ id: row.exercise_id, name_ru: "Жим гантелей", muscle_group: "Грудь", equipment: "гантели", tags: ["load:weight_reps"], weight_rule: "per_hand",
    secondary_muscle_groups: [], description: null, technique: null, common_mistakes: null, difficulty: 1,
    video_url: null, animation_url: null, image_url: null, thumbnail_url: null, media_duration_sec: null, media_source: "none",
  })));
}

export function emptyPersonalDraft(): PersonalProgramDraft {
  return { name: "", location: "gym", progression: "phased", durationWeeks: "8", days: [{ name: "День 1", exercises: [] }], dayCount: 1, activeDay: 0, step: "setup" };
}
