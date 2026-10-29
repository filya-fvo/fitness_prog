export function validProgramNumber(value: string, min: number, max: number) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
}

export function validProgramWeight(value: string) {
  return value === "" || (/^\d+(?:[.,]\d+)?$/.test(value) && (value.split(/[.,]/)[1] ?? "").replace(/0+$/, "").length <= 2 && Number(value.replace(",", ".")) > 0 && Number(value.replace(",", ".")) <= 10000);
}

export type ProgramTimeUnit = "seconds" | "minutes";
/** Exact integer arithmetic: incomplete decimals and fractional seconds never round. */
export function programTimeSeconds(value: string, unit: ProgramTimeUnit): number | null {
  if (unit === "seconds") return validProgramNumber(value, 1, 86400) ? Number(value) : null;
  if (!/^\d+(?:[.,]\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const digits = fraction.replace(/0+$/, "");
  if (digits.length > 2 || Number(whole) > 1440) return null;
  const scale = 10 ** digits.length;
  const numerator = (Number(whole) * scale + Number(digits)) * 60;
  return numerator % scale === 0 && numerator / scale >= 1 && numerator / scale <= 86400 ? numerator / scale : null;
}

export function changeProgramTimeUnit(value: string, from: ProgramTimeUnit, to: ProgramTimeUnit): string | null {
  const seconds = programTimeSeconds(value, from);
  if (seconds === null || from === to) return value;
  // Seconds divisible by three have a finite decimal representation in minutes.
  return to === "seconds" ? String(seconds) : seconds % 3 === 0 ? String(seconds / 60) : null;
}
