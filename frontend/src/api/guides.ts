import { apiClient } from "@/api/client";
export type GuideKind = "user" | "admin";

export async function fetchGuide(kind: GuideKind): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/guides/${kind}`, { responseType: "blob" });
  if (!response.data.type.startsWith("text/markdown")) throw new Error("Некорректный файл инструкции");
  return response.data;
}
