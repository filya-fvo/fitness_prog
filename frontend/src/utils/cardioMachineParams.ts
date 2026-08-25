import type { CardioMachineKind } from "@/utils/exerciseLoadType";

export type CardioParamKey = "speed" | "incline" | "resistance" | "pace";

export type CardioParamValues = Record<CardioParamKey, number>;

export type CardioParamField = {
  key: CardioParamKey;
  label: string;
  shortLabel: string;
  step?: number;
};

export const DEFAULT_CARDIO_PARAM_VALUES: CardioParamValues = {
  speed: 6,
  incline: 1,
  resistance: 5,
  pace: 2.3,
};

const FIELD_META: Record<CardioParamKey, CardioParamField> = {
  speed: { key: "speed", label: "Скорость", shortLabel: "Скор.", step: 0.1 },
  incline: { key: "incline", label: "Наклон", shortLabel: "Накл.", step: 0.5 },
  resistance: { key: "resistance", label: "Сопротивление", shortLabel: "Сопр." },
  pace: { key: "pace", label: "Темп /500 м", shortLabel: "Темп /500 м", step: 0.1 },
};

const MACHINE_PARAM_KEYS: Record<CardioMachineKind, readonly CardioParamKey[]> = {
  treadmill: ["speed", "incline"],
  elliptical: ["resistance"],
  bike: ["speed", "resistance"],
  rower: ["resistance", "pace"],
  other: ["resistance"],
};

export function cardioMachineFields(kind: CardioMachineKind): CardioParamField[] {
  return MACHINE_PARAM_KEYS[kind].map((key) => FIELD_META[key]);
}

export function buildCardioMachineParams(
  kind: CardioMachineKind,
  values: CardioParamValues,
): Record<string, number> {
  return Object.fromEntries(
    MACHINE_PARAM_KEYS[kind].map((key) => [key, values[key]]),
  );
}

export function initialCardioParamValues(
  source: Record<string, string | number> | null | undefined,
): CardioParamValues {
  return Object.fromEntries(
    Object.entries(DEFAULT_CARDIO_PARAM_VALUES).map(([key, fallback]) => {
      const parsed = Number(source?.[key]);
      return [key, Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback];
    }),
  ) as CardioParamValues;
}
