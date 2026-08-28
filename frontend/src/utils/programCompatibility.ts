import type { Program } from "@/types/workout";
import { enumLabel } from "@/utils/localization";
import {
  levelOf,
  programEquipment,
  programDays,
  programLimitations,
  programLocation,
  programSex,
  type RecommendInput,
} from "@/utils/programRecommend";

export type ProgramMismatch = {
  field: "limitations" | "location" | "equipment" | "level" | "days" | "sex";
  message: string;
  critical: boolean;
};

function normalizedList(value: RecommendInput["limitations"]): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).toLowerCase());
  const text = String(value || "").toLowerCase();
  const result: string[] = [];
  if (text.includes("no_knee") || text.includes("колен")) result.push("no_knee");
  if (text.includes("no_spine") || text.includes("спин") || text.includes("позвон")) result.push("no_spine");
  if (text.includes("shoulder_sensitive") || text.includes("плеч")) result.push("shoulder_sensitive");
  return result;
}

export function compareProgramToProfile(
  program: Program,
  profile: RecommendInput,
): ProgramMismatch[] {
  const result: ProgramMismatch[] = [];
  const requiredLimits = normalizedList(profile.limitations);
  const supportedLimits = new Set(programLimitations(program));
  const missingLimits = requiredLimits.filter((item) => !supportedLimits.has(item));
  if (missingLimits.length) {
    result.push({
      field: "limitations",
      critical: true,
      message: `не учитывает: ${missingLimits.map((item) => enumLabel(item)).join(", ")}`,
    });
  }

  const wantedLocation = String(profile.location || "").toLowerCase();
  const actualLocation = programLocation(program);
  if (wantedLocation && actualLocation && wantedLocation !== actualLocation) {
    result.push({
      field: "location",
      critical: false,
      message: `место: ${enumLabel(actualLocation)} вместо «${enumLabel(wantedLocation)}»`,
    });
  }

  const availableEquipment = new Set((profile.equipment || []).map((item) => item.toLowerCase()));
  const missingEquipment = programEquipment(program).filter(
    (item) => item !== "bodyweight" && availableEquipment.size > 0 && !availableEquipment.has(item),
  );
  if (missingEquipment.length) {
    result.push({
      field: "equipment",
      critical: false,
      message: `может потребоваться другое оборудование (${missingEquipment.length})`,
    });
  }

  const wantedLevel = String(profile.level || "").toLowerCase();
  const actualLevel = levelOf(program);
  if (wantedLevel && actualLevel && wantedLevel !== actualLevel) {
    result.push({
      field: "level",
      critical: false,
      message: `уровень: ${enumLabel(actualLevel)} вместо «${enumLabel(wantedLevel)}»`,
    });
  }

  const wantedDays = profile.daysPerWeek;
  const actualDays = programDays(program);
  if (wantedDays && actualDays && wantedDays !== actualDays) {
    result.push({
      field: "days",
      critical: false,
      message: `${actualDays} дн./нед. вместо выбранных ${wantedDays}`,
    });
  }

  const wantedSex = String(profile.sex || "").toLowerCase();
  const allowedSex = programSex(program);
  const isUniversal = allowedSex.length === 0 || allowedSex.some((item) => ["any", "all", "unisex"].includes(item));
  if (wantedSex && !isUniversal && !allowedSex.includes(wantedSex)) {
    result.push({
      field: "sex",
      critical: false,
      message: `вариант программы: ${allowedSex.map((item) => enumLabel(item)).join("/")}`,
    });
  }

  return result;
}

export function programMismatchSummary(mismatches: ProgramMismatch[]): string {
  return mismatches.map((item) => item.message).join("; ");
}
