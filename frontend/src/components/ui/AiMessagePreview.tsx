import { useId, useState } from "react";
import { previewAiMessage } from "@/utils/aiMessage";

export function AiMessagePreview({ text }: { text: string }) {
  const id = useId();
  const [expandedText, setExpandedText] = useState<string | null>(null);
  const preview = previewAiMessage(text);
  const expanded = expandedText === text;
  return <>
    <p id={id} className="whitespace-pre-wrap text-sm text-tg-hint">{expanded ? text : preview}</p>
    {preview !== text ? (
      <button type="button" aria-expanded={expanded} aria-controls={id}
        onClick={() => setExpandedText(expanded ? null : text)}
        className="mt-2 min-h-11 rounded-lg px-2 text-xs font-medium text-tg-link">
        {expanded ? "Свернуть" : "Подробнее"}
      </button>
    ) : null}
  </>;
}
