import { describe, expect, it } from "vitest";

import { inferLoadType } from "@/utils/exerciseLoadType";

function ex(name_ru: string, extra: Partial<{ muscle_group: string; equipment: string; tags: string[] }> = {}) {
  return {
    name_ru,
    muscle_group: extra.muscle_group ?? "",
    equipment: extra.equipment ?? null,
    tags: extra.tags ?? [],
  };
}

describe("inferLoadType", () => {
  it("uses weight+reps for bent-over rows (наклон must not force timed)", () => {
    expect(inferLoadType(ex("Тяга штанги в наклоне"))).toBe("weight_reps");
    expect(inferLoadType(ex("Тяга гантели в наклоне"))).toBe("weight_reps");
    expect(inferLoadType(ex("Разводка в наклоне"))).toBe("weight_reps");
  });

  it("keeps timed holds and mobility", () => {
    expect(inferLoadType(ex("Планка"))).toBe("timed");
    expect(inferLoadType(ex("Наклоны к носкам"))).toBe("timed");
    expect(inferLoadType(ex("Кошка-корова"))).toBe("timed");
  });

  it("classifies machines and bodyweight", () => {
    expect(inferLoadType(ex("Велотренажёр"))).toBe("cardio_machine");
    expect(inferLoadType(ex("Отжимания от пола"))).toBe("reps_only");
    expect(inferLoadType(ex("Жим штанги лёжа"))).toBe("weight_reps");
  });
});
