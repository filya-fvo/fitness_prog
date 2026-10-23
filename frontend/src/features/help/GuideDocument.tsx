import { Fragment, useMemo, type ReactNode } from "react";

type Block = { kind: "heading"; text: string; level: number; id: string }
  | { kind: "paragraph" | "code"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; rows: string[][] };

function blocksOf(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const result: Block[] = [];
  let heading = 0;
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const title = /^(#{1,6})\s+(.+)$/.exec(line);
    if (title) {
      if (!(result.length === 0 && title[1].length === 1)) result.push({ kind: "heading", text: title[2], level: title[1].length, id: `guide-section-${heading++}` });
      i++; continue;
    }
    if (/^```/.test(line)) {
      const code: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      result.push({ kind: "code", text: code.join("\n") }); continue;
    }
    if (/^\s*\|/.test(line) && /^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      const cells = (value: string) => value.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
      const rows = [cells(line)]; i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      result.push({ kind: "table", rows }); continue;
    }
    const item = /^\s*([-*]|\d+\.)\s+(.+)$/.exec(line);
    if (item) {
      const ordered = /^\d/.test(item[1]), items: string[] = [];
      while (i < lines.length) {
        const next = /^\s*([-*]|\d+\.)\s+(.+)$/.exec(lines[i]);
        if (!next || /^\d/.test(next[1]) !== ordered) break;
        items.push(next[2]); i++;
      }
      result.push({ kind: "list", ordered, items }); continue;
    }
    const paragraph = [line.replace(/^>\s?/, "")]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*([-*]|\d+\.)\s)/.test(lines[i])) paragraph.push(lines[i++].replace(/^>\s?/, ""));
    result.push({ kind: "paragraph", text: paragraph.join("\n") });
  }
  return result;
}

function safeHref(value: string): string | null {
  if (value.startsWith("#") || (value.startsWith("/") && !value.startsWith("//"))) return value;
  try { const url = new URL(value); return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|<https?:\/\/[^>]+>)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="break-all rounded bg-tg-secondary px-1">{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    const angle = /^<(https?:\/\/[^>]+)>$/.exec(part);
    if (link || angle) {
      const href = safeHref(link?.[2] ?? angle![1]), label = link?.[1] ?? angle![1];
      return href ? <a key={index} href={href} className="break-words text-tg-link underline" target={/^https?:/.test(href) ? "_blank" : undefined} rel="noopener noreferrer">{label}</a> : <Fragment key={index}>{label}</Fragment>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function GuideDocument({ text }: { text: string }) {
  const blocks = useMemo(() => blocksOf(text), [text]);
  const headings = blocks.filter(block => block.kind === "heading");
  return <>
    {headings.length ? <nav aria-label="Оглавление инструкции" className="app-card mb-5 p-4">
      <details open><summary className="min-h-11 cursor-pointer font-semibold">Оглавление</summary>
        <ul className="max-h-64 overflow-y-auto">{headings.map(heading => <li key={heading.id} className={heading.level > 2 ? "pl-4" : undefined}>
          <a href={`#${heading.id}`} className="inline-flex min-h-11 items-center py-2 text-tg-link underline">{inline(heading.text)}</a>
        </li>)}</ul>
      </details>
    </nav> : null}
    <article className="min-w-0 space-y-4 break-words text-base leading-relaxed">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          const Tag = block.level > 2 ? "h3" : "h2";
          return <Tag key={index} id={block.id} className="scroll-mt-5 pt-3 text-lg font-semibold">{inline(block.text)}</Tag>;
        }
        if (block.kind === "code") return <pre key={index} className="max-w-full overflow-x-auto rounded-xl bg-tg-secondary p-3 text-sm"><code>{block.text}</code></pre>;
        if (block.kind === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return <Tag key={index} className={`space-y-2 pl-6 ${block.ordered ? "list-decimal" : "list-disc"}`}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</Tag>;
        }
        if (block.kind === "table") return <div key={index} className="max-w-full overflow-x-auto"><table className="w-full border-collapse text-left text-sm">
          <thead><tr>{block.rows[0].map((cell, cellIndex) => <th key={cellIndex} scope="col" className="border-b p-2">{inline(cell)}</th>)}</tr></thead>
          <tbody>{block.rows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border-b p-2 align-top">{inline(cell)}</td>)}</tr>)}</tbody>
        </table></div>;
        return <p key={index} className="whitespace-pre-line">{inline(block.text)}</p>;
      })}
    </article>
  </>;
}
