import axios from "axios";

export type PlusRequiredDetail = {
  code: "plus_required";
  feature: string;
  message: string;
};

export function plusRequiredDetail(error: unknown): PlusRequiredDetail | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 403) return null;
  const detail = error.response.data?.detail as Partial<PlusRequiredDetail> | undefined;
  if (
    detail?.code !== "plus_required" ||
    typeof detail.feature !== "string" ||
    typeof detail.message !== "string"
  ) return null;
  return detail as PlusRequiredDetail;
}

export function isPlusRequiredError(error: unknown): boolean {
  return plusRequiredDetail(error) !== null;
}
