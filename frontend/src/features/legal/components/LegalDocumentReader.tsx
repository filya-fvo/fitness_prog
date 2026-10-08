import type { LegalDocument } from "../documents";

export function LegalDocumentReader({ document }: { document: LegalDocument }) {
  const blocks = document.text.split(/\n\s*\n/).slice(1);
  return <article className="space-y-4 break-words text-base leading-relaxed">
    {blocks.map((block, index) => block.startsWith("## ")
      ? <h2 key={index} className="pt-2 text-lg font-semibold">{block.slice(3)}</h2>
      : <p key={index} className="whitespace-pre-line">{block}</p>)}
  </article>;
}
