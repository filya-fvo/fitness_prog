import { useState } from "react";

import { getStoredToken } from "@/api/client";
import { fetchGuide, type GuideKind } from "@/api/guides";
import { useUserStore } from "@/store/userStore";
import { isAdminUser } from "@/utils/adminAccess";

export function GuideDownloads() {
  const user = useUserStore((state) => state.user);
  const [loading, setLoading] = useState<GuideKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(kind: GuideKind) {
    if (loading || (kind === "admin" && !user)) return;
    const owner = user?.id;
    const token = getStoredToken();
    setLoading(kind);
    setError(null);
    try {
      const blob = await fetchGuide(kind);
      if (kind === "admin" && (useUserStore.getState().user?.id !== owner || getStoredToken() !== token)) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = kind === "admin" ? "Fitness_Mini_App_Admin_Instrukciya.md" : "Fitness_Mini_App_Instrukciya.md";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      if (kind === "user" || useUserStore.getState().user?.id === owner) setError("Не удалось скачать инструкцию. Попробуйте ещё раз");
    } finally {
      setLoading(null);
    }
  }

  return <div className="app-card app-card-ocean mb-4 p-4">
    <h2 className="text-sm font-semibold">Полные инструкции</h2>
    <p className="mt-1 text-xs text-tg-hint">Сохраните руководство файлом, чтобы читать без интернета. Текстовый файл (.md).</p>
    <div className="mt-3 flex flex-col gap-2">
      <button type="button" disabled={Boolean(loading)} onClick={() => void download("user")} className="app-button app-secondary-action px-3 py-2 text-sm">{loading === "user" ? "Скачивание…" : "Скачать инструкцию пользователя"}</button>
      {isAdminUser(user) ? <button type="button" disabled={Boolean(loading)} onClick={() => void download("admin")} className="app-button app-secondary-action px-3 py-2 text-sm">{loading === "admin" ? "Скачивание…" : "Скачать инструкцию администратора"}</button> : null}
    </div>
    {error ? <p role="alert" className="app-status app-status-danger mt-2 text-sm">{error}</p> : null}
  </div>;
}
