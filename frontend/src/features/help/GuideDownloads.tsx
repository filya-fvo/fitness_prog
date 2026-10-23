import { useState } from "react";
import { Link } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchGuide, type GuideKind } from "@/api/guides";
import { saveGuideFile } from "@/lib/guideFileDownload";
import { useUserStore } from "@/store/userStore";
import { isAdminUser } from "@/utils/adminAccess";

export function GuideDownloads({ readingKind }: { readingKind?: GuideKind } = {}) {
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
      await saveGuideFile(kind, blob);
    } catch {
      if (kind === "user" || useUserStore.getState().user?.id === owner) setError("Не удалось скачать инструкцию. Попробуйте ещё раз");
    } finally {
      setLoading(null);
    }
  }

  return <div className="app-card app-card-ocean mb-4 p-4">
    <h2 className="text-sm font-semibold">Полные инструкции</h2>
    <p className="mt-1 text-xs text-tg-hint">Откройте руководство в приложении или сохраните файлом, чтобы читать без интернета.</p>
    <div className="mt-3 flex flex-col gap-2">
      {!readingKind ? <Link to="/help/instructions/user" className="app-button app-secondary-action min-h-11 px-3 py-2 text-sm">Открыть инструкцию пользователя</Link> : null}
      {readingKind !== "admin" ? <button type="button" disabled={Boolean(loading)} onClick={() => void download("user")} className="app-button app-secondary-action px-3 py-2 text-sm">{loading === "user" ? "Скачивание…" : "Скачать инструкцию пользователя"}</button> : null}
      {!readingKind && isAdminUser(user) ? <Link to="/help/instructions/admin" className="app-button app-secondary-action min-h-11 px-3 py-2 text-sm">Открыть инструкцию администратора</Link> : null}
      {isAdminUser(user) && readingKind !== "user" ? <button type="button" disabled={Boolean(loading)} onClick={() => void download("admin")} className="app-button app-secondary-action px-3 py-2 text-sm">{loading === "admin" ? "Скачивание…" : "Скачать инструкцию администратора"}</button> : null}
    </div>
    {error ? <p role="alert" className="app-status app-status-danger mt-2 text-sm">{error}</p> : null}
  </div>;
}
