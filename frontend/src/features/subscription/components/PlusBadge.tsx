export function PlusBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex rounded-full bg-tg-button/15 px-2.5 py-1 text-xs font-semibold text-tg-link ${className}`.trim()}>
      PLUS
    </span>
  );
}
