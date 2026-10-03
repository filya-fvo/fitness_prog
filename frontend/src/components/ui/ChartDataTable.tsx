import type { ReactNode } from "react";

type Props = {
  caption: string;
  columns: string[];
  rows: Array<{ key: string; cells: ReactNode[] }>;
};

/** Exact chart values, readable without hover and expandable with keyboard or touch. */
export function ChartDataTable({ caption, columns, rows }: Props) {
  if (!rows.length) return null;
  return (
    <details className="mt-3 rounded-xl border border-[var(--border-subtle)]">
      <summary className="min-h-11 cursor-pointer list-inside px-3 py-3 text-xs font-medium text-tg-link">
        Точные значения ({rows.length})
      </summary>
      <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto rounded-b-xl">
        <table className="w-full min-w-[320px] border-collapse text-left text-xs text-tg-text">
          <caption className="p-2 text-left font-medium">{caption}</caption>
          <thead className="bg-tg-bg text-tg-hint"><tr>{columns.map((column) => (
            <th key={column} scope="col" className="px-2 py-2 font-medium">{column}</th>
          ))}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.key} className="border-t border-[var(--border-subtle)]">
            {row.cells.map((cell, index) => <td key={index} className="px-2 py-2 align-top tabular-nums">{cell}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}
