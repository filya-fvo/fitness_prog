export const AI_MESSAGE_PREVIEW_LIMIT = 650;

export function previewAiMessage(content: string, limit = AI_MESSAGE_PREVIEW_LIMIT): string {
  if (content.length <= limit) return content;
  const candidate = content.slice(0, limit + 1);
  const wordBoundary = candidate.lastIndexOf(" ");
  const end = wordBoundary >= Math.round(limit * 0.75) ? wordBoundary : limit;
  return `${content.slice(0, end).trimEnd()}…`;
}
