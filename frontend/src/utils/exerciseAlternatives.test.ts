import { describe, expect, it } from "vitest";

import type { Exercise } from "@/types/workout";
import {
  buildBulkReplacementPlan,
  movementFamily,
  rankEquivalentExercises,
} from "@/utils/exerciseAlternatives";

function exercise(
  id: string,
  name_ru: string,
  muscle_group: string,
  equipment: string,
  difficulty = 2,
): Exercise {
  return {
    id,
    name_ru,
    muscle_group,
    equipment,
    difficulty,
    description: null,
    technique: null,
    common_mistakes: null,
    video_url: null,
    animation_url: null,
    thumbnail_url: null,
    media_duration_sec: null,
    media_source: "none",
    tags: [],
  };
}

describe("exercise alternatives", () => {
  const bench = exercise("bench", "Жим штанги лёжа", "грудь", "штанга", 3);
  const dumbbell = exercise("db", "Жим гантелей лёжа", "грудь", "гантели", 2);
  const incline = exercise("incline", "Жим гантелей на наклонной", "грудь", "гантели", 3);
  const machine = exercise("machine", "Жим в тренажёре", "грудь", "тренажёр", 2);
  const fly = exercise("fly", "Разведение гантелей лёжа", "грудь", "гантели", 2);

  it("keeps replacements in the same movement family and load format", () => {
    const ranked = rankEquivalentExercises(bench, [bench, dumbbell, incline, machine, fly]);

    expect(movementFamily(bench)).toBe("horizontal_press");
    expect(ranked.map((item) => item.id)).toEqual(expect.arrayContaining(["db", "incline", "machine"]));
    expect(ranked.map((item) => item.id)).not.toContain("fly");
  });

  it("respects equipment and skips completed exercises", () => {
    const row = exercise("row", "Тяга горизонтального блока", "спина", "блок/кроссовер", 2);
    const preview = buildBulkReplacementPlan({
      planExercises: [
        { exercise_id: "bench", order: 1, target_sets: 3 },
        { exercise_id: "row", order: 2, target_sets: 3 },
      ],
      catalog: [bench, dumbbell, incline, machine, fly, row],
      completedExerciseIds: new Set(["row"]),
      allowedEquipment: new Set(["dumbbells"]),
    });

    expect(preview.replacements).toHaveLength(1);
    expect(preview.replacements[0]?.fromExercise.id).toBe("bench");
    expect(preview.replacements[0]?.toExercise.equipment).toBe("гантели");
    expect(preview.completedSkipped).toBe(1);
  });

  it("does not suggest unsafe knee patterns for no_knee plans", () => {
    const squat = exercise("squat", "Приседания со своим весом", "ноги", "свой вес", 1);
    const goblet = exercise("goblet", "Приседания с гантелью у груди", "ноги", "гантели", 2);

    expect(
      rankEquivalentExercises(squat, [squat, goblet], {
        limitations: new Set(["no_knee"]),
      }),
    ).toEqual([]);
  });

  it("does not suggest presses for shoulder-sensitive plans", () => {
    expect(
      rankEquivalentExercises(bench, [bench, dumbbell, incline, machine], {
        limitations: new Set(["shoulder_sensitive"]),
      }),
    ).toEqual([]);
  });

  it("offers supported machine squat variants for a barbell squat", () => {
    const barbellSquat = exercise("barbell-squat", "Приседания со штангой", "ноги", "штанга", 3);
    const smithSquat = exercise("smith-squat", "Приседания в машине Смита", "ноги", "машина Смита", 3);
    const hackSquat = exercise("hack-squat", "Гакк-приседания", "ноги", "гакк-тренажёр", 2);

    expect(
      rankEquivalentExercises(barbellSquat, [barbellSquat, smithSquat, hackSquat]).map(
        (item) => item.id,
      ),
    ).toEqual(expect.arrayContaining(["smith-squat", "hack-squat"]));
  });

  it("covers the added machine and cable variants across major movement families", () => {
    const pairs: Array<[Exercise, Exercise]> = [
      [bench, exercise("smith-bench", "Жим лёжа в машине Смита", "грудь", "машина Смита", 3)],
      [
        exercise("fly-source", "Сведение рук в кроссовере", "грудь", "блок/кроссовер", 2),
        exercise("pec-deck", "Сведение рук в тренажёре «бабочка»", "грудь", "тренажёр", 2),
      ],
      [
        exercise("row-source", "Тяга штанги в наклоне", "спина", "штанга", 3),
        exercise("machine-row", "Тяга с упором грудью в тренажёре", "спина", "тренажёр", 2),
      ],
      [
        exercise("press-source", "Жим гантелей сидя", "плечи", "гантели", 2),
        exercise("machine-press", "Жим вверх в тренажёре сидя", "плечи", "тренажёр", 2),
      ],
      [
        exercise("curl-source", "Сгибания ног лёжа", "ноги", "тренажёр", 2),
        exercise("seated-curl", "Сгибания ног сидя", "ноги", "тренажёр", 2),
      ],
      [
        exercise("bridge-source", "Ягодичный мост со штангой", "ноги", "штанга", 3),
        exercise("smith-bridge", "Ягодичный мост в машине Смита", "ноги", "машина Смита", 3),
      ],
      [
        exercise("twist-source", "Русские скручивания", "кор", "свой вес", 2),
        exercise("pallof", "Жим Паллофа с резинкой", "кор", "резинка", 2),
      ],
    ];

    for (const [source, alternative] of pairs) {
      expect(movementFamily(alternative)).toBe(movementFamily(source));
      expect(rankEquivalentExercises(source, [source, alternative])).toContainEqual(alternative);
    }
  });

  it("treats bodyweight as universally available and classifies Australian rows", () => {
    const bandRow = exercise("band-row", "Тяга резинки к поясу", "спина", "резинка", 2);
    const australian = exercise(
      "australian",
      "Австралийские подтягивания",
      "спина",
      "свой вес",
      2,
    );

    expect(
      rankEquivalentExercises(bandRow, [bandRow, australian], {
        allowedEquipment: new Set(["bands"]),
      }).map((item) => item.id),
    ).toEqual(["australian"]);
  });
});
