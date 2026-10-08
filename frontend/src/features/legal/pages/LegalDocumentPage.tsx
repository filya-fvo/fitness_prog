import { Link, useParams } from "react-router-dom";
import { legalDocuments } from "../documents";
import { LegalDocumentReader } from "../components/LegalDocumentReader";
import { LegalLinks } from "../components/LegalLinks";

export function LegalDocumentPage() {
  const { documentId } = useParams();
  const document = legalDocuments.find((entry) => entry.document_id === documentId);
  return <main className="app-shell min-h-screen text-tg-text">
    <div className="mx-auto max-w-3xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
      <Link to="/" className="app-button app-secondary-action mb-5 min-h-11">Вернуться в приложение</Link>
      <h1 className="mb-5 text-2xl font-bold">{document?.title ?? "Документ не найден"}</h1>
      {document ? <LegalDocumentReader document={document} /> : null}
      <div className="mt-8 border-t border-[var(--border-subtle)] pt-4"><LegalLinks /></div>
    </div>
  </main>;
}
