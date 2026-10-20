import type { GuideKind } from "@/api/guides";

/** Native builds replace this small file boundary, keeping the shared guide UI. */
export async function saveGuideFile(kind: GuideKind, blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = kind === "admin" ? "Fitness_Mini_App_Admin_Instrukciya.md" : "Fitness_Mini_App_Instrukciya.md";
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
