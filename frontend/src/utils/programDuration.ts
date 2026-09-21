import type { Program } from "@/types/workout";

export type ProgramDurationRange = {
  min: number;
  max: number;
};

function validMinutes(value: unknown): number | null {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 240) return null;
  return Math.round(minutes);
}

export function programDurationRange(program: Pick<Program, "structure">): ProgramDurationRange | null {
  const minimum = validMinutes(program.structure.session_duration_min);
  if (minimum == null) return null;

  const configuredMaximum = validMinutes(program.structure.session_duration_max);
  const maximum = configuredMaximum != null && configuredMaximum >= minimum
    ? configuredMaximum
    : Math.min(240, minimum + 15);

  return { min: minimum, max: maximum };
}

export function programDurationLabel(program: Pick<Program, "structure">): string | null {
  const duration = programDurationRange(program);
  if (!duration) return null;
  if (duration.min === duration.max) return `около ${duration.min} мин`;
  return `обычно ${duration.min}–${duration.max} мин`;
}
