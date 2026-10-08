import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthUser } from "@/api/auth";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { getTelegramWebApp } from "@/lib/telegram";
import { legalDocuments, type LegalDocumentId } from "../documents";
import { useLegalConsent } from "../hooks/useLegalConsent";
import { LegalDocumentReader } from "./LegalDocumentReader";

const labels = {
  privacy: { read: "Прочитать Политику", check: "Я ознакомился с Политикой обработки и защиты персональных данных" },
  consent: { read: "Прочитать согласие", check: "Я даю согласие на обработку обычных персональных данных" },
  offer: { read: "Прочитать оферту", check: "Я принимаю оферту бесплатного использования FilFit" },
};

export function LegalConsentGate({ user }: { user: AuthUser }) {
  const consent = useLegalConsent(user);
  const { decline } = consent;
  const [reading, setReading] = useState<LegalDocumentId | null>(null);
  const lastReading = useRef<LegalDocumentId | null>(null);
  const close = useCallback(() => reading ? setReading(null) : decline(), [reading, decline]);
  const dialogRef = useModalAccessibility(true, close);
  const document = legalDocuments.find((entry) => entry.document_id === reading);

  useEffect(() => {
    const button = getTelegramWebApp()?.BackButton;
    if (!button) return;
    const wasVisible = button.isVisible;
    button.show(); button.onClick(close);
    return () => { button.offClick(close); if (!wasVisible) button.hide(); };
  }, [close]);

  useEffect(() => {
    const target = reading ? "[data-document-back]" : lastReading.current ? `#legal-read-${lastReading.current}` : null;
    if (reading) lastReading.current = reading;
    if (!target) return;
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>(target)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [dialogRef, reading]);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))]">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="legal-gate-title" tabIndex={-1} className="app-card app-card-neutral flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-xl flex-col overflow-hidden text-tg-text shadow-2xl">
      <header className="shrink-0 border-b border-[var(--border-subtle)] px-5 py-4">
        <h1 id="legal-gate-title" className="text-xl font-bold">Документы FilFit</h1>
        {!document ? <p className="mt-2 text-sm text-tg-hint">Прочитайте документы и подтвердите каждый отдельно. Для этой редакции достаточно одного подтверждения в вашем аккаунте.</p> : null}
      </header>
      <div className="min-h-0 overflow-y-auto px-5 py-4">
        {document ? <>
          <button type="button" data-document-back className="app-button app-secondary-action mb-4 min-h-11" onClick={() => setReading(null)}>К подтверждению</button>
          <h2 className="mb-4 text-lg font-semibold">{document.title}</h2>
          <LegalDocumentReader document={document} />
        </> : <div className="space-y-4">
          {legalDocuments.map((entry) => <div key={entry.document_id} className="rounded-xl border border-[var(--border-subtle)] px-3 py-2">
            <button id={`legal-read-${entry.document_id}`} type="button" className="min-h-11 text-left text-base font-medium text-[var(--app-info)] underline underline-offset-4" onClick={() => setReading(entry.document_id)}>{labels[entry.document_id].read}</button>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm leading-relaxed">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--app-accent)]" checked={consent.checks[entry.document_id]} disabled={consent.pending} onChange={(event) => consent.setCheck(entry.document_id, event.target.checked)} />
              <span>{labels[entry.document_id].check}</span>
            </label>
          </div>)}
          <p className="text-sm text-tg-hint">Сведения о здоровье требуют отдельного согласия. Это базовое подтверждение их не охватывает.</p>
          {!consent.online ? <p role="status" className="text-sm text-tg-hint">Подключитесь к интернету, чтобы сохранить подтверждение. Ваши записи сохранены.</p> : null}
          {consent.error ? <p role="alert" className="text-sm text-[var(--app-danger)]">{consent.error}</p> : null}
        </div>}
      </div>
      {!document ? <footer className="shrink-0 space-y-2 border-t border-[var(--border-subtle)] px-5 py-3">
        <button type="button" className="app-button app-gradient-action min-h-11 w-full" disabled={consent.pending || !consent.online || !Object.values(consent.checks).every(Boolean)} onClick={() => void consent.submit()}>{consent.pending ? "Сохраняем…" : "Подтвердить и продолжить"}</button>
        <button type="button" className="app-button app-ghost-action min-h-11 w-full" disabled={consent.pending} onClick={consent.decline}>Выйти без подтверждения</button>
      </footer> : null}
    </section>
  </div>;
}
