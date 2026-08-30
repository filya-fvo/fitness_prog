import { useState } from "react";

import {
  downloadAdminAudit,
  type AdminAuditExportFormat,
  type AdminAuditFilters,
} from "@/api/adminAudit";
import { toUserMessage } from "@/utils/errors";

export const ADMIN_AUDIT_EXPORT_LIMIT = 1000;

function downloadFilename(format: AdminAuditExportFormat): string {
  const stamp = new Date().toISOString().replaceAll(/[-:]/g, "").slice(0, 15);
  return `fitness-admin-audit-${stamp}.${format}`;
}

export function AdminAuditExport({
  filters,
  total,
}: {
  filters: AdminAuditFilters;
  total: number;
}) {
  const [busy, setBusy] = useState<AdminAuditExportFormat | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportFile(format: AdminAuditExportFormat) {
    setBusy(format);
    setNotice(null);
    setError(null);
    try {
      const result = await downloadAdminAudit(filters, format);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadFilename(format);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice(
        result.truncated
          ? `Скачано ${result.exportedCount} из ${result.totalMatches} записей — сработал лимит.`
          : `Скачано записей: ${result.exportedCount}.`,
      );
    } catch (exportError) {
      setError(toUserMessage(exportError, "Не удалось подготовить выгрузку журнала."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-4 rounded-2xl bg-tg-secondary p-4" aria-labelledby="audit-export-title">
      <h2 id="audit-export-title" className="text-sm font-semibold text-tg-text">
        Экспорт текущей выборки
      </h2>
      <p className="mt-1 text-xs text-tg-hint">
        Применяются выбранные фильтры. Сервер выгружает не более {ADMIN_AUDIT_EXPORT_LIMIT} новых записей.
      </p>
      {total > ADMIN_AUDIT_EXPORT_LIMIT ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Найдено {total}: уточните фильтры, если нужны записи за пределами лимита.
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-3">
        {(["csv", "json"] as const).map((format) => (
          <button
            key={format}
            type="button"
            disabled={busy !== null || total === 0}
            onClick={() => void exportFile(format)}
            className="min-h-11 rounded-xl bg-tg-bg px-4 text-sm font-medium text-tg-link disabled:opacity-40"
          >
            {busy === format ? "Подготовка…" : `Скачать ${format.toUpperCase()}`}
          </button>
        ))}
      </div>
      {notice ? <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
      {error ? <p role="alert" className="mt-3 text-xs text-red-700 dark:text-red-300">{error}</p> : null}
    </section>
  );
}
