import { describe, expect, it } from "vitest";

import {
  daysCount,
  enumLabel,
  exercisesCount,
  setsCount,
  programDayLabel,
  subscriptionLabel,
  visibleExerciseTags,
  workoutsCount,
} from "@/utils/localization";

describe("localization", () => {
  it("does not expose internal enum values", () => {
    expect(enumLabel("beginner")).toBe("Новичок");
    expect(enumLabel("home_express")).toBe("Домашняя экспресс");
    expect(enumLabel("full_body")).toBe("Всё тело");
    expect(enumLabel("unknown_internal_value")).toBe("Не указано");
  });

  it("uses correct Russian plurals", () => {
    expect(workoutsCount(1)).toBe("1 тренировка");
    expect(workoutsCount(2)).toBe("2 тренировки");
    expect(workoutsCount(5)).toBe("5 тренировок");
    expect(workoutsCount(11)).toBe("11 тренировок");
    expect(workoutsCount(21)).toBe("21 тренировка");
    expect(daysCount(3)).toBe("3 дня");
    expect(setsCount(4)).toBe("4 подхода");
    expect(exercisesCount(7)).toBe("7 упражнений");
  });

  it("localizes legacy English day titles", () => {
    expect(programDayLabel("Full Body A")).toBe("Всё тело A");
    expect(programDayLabel("Push + legs")).toBe("Жим + Ноги");
    expect(programDayLabel("Spine-safe home B")).toBe("Без нагрузки на позвоночник Дом B");
    expect(programDayLabel("Сила FB 3 дня")).toBe("Сила Всё тело 3 дня");
  });

  it("translates backend values and preserves Russian catalog labels", () => {
    expect(enumLabel("completed")).toBe("Завершена");
    expect(enumLabel("dumbbells")).toBe("Гантели");
    expect(enumLabel("грудь")).toBe("грудь");
    expect(subscriptionLabel("premium")).toBe("Премиум");
  });

  it("shows only meaningful translated exercise tags", () => {
    expect(visibleExerciseTags(["ds:0315", "gymvisual", "unilateral", "load:timed"]))
      .toEqual(["На одну сторону", "На время"]);
  });
});
