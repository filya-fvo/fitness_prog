import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.resolve("src");
const forbidden = [
  { name: "старый цвет успеха", pattern: /\b(?:text|bg)-lime-[\w/-]+/g },
  { name: "старый псевдоним бренда", pattern: /app-signal(?:-strong|-text)?/g },
  { name: "прямой цвет бренда", pattern: /#(?:ff6b24|e83d81|7c4dff)\b/gi },
];
const allowedTokens = new Set([
  "--app-brand-start: #ff6b24;",
  "--app-brand-mid: #e83d81;",
  "--app-brand-end: #7c4dff;",
]);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(location);
    return /\.(?:tsx|css)$/.test(entry.name) ? [location] : [];
  }));
  return nested.flat();
}

const findings = [];
for (const file of await sourceFiles(sourceRoot)) {
  const relative = path.relative(process.cwd(), file).replaceAll(path.sep, "/");
  const lines = (await readFile(file, "utf8")).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (relative === "src/index.css" && allowedTokens.has(line.trim())) return;
    for (const rule of forbidden) {
      if (rule.pattern.test(line)) findings.push(`${relative}:${index + 1} ${rule.name}`);
      rule.pattern.lastIndex = 0;
    }
  });
}

if (findings.length) {
  process.stderr.write(`${findings.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Визуальные токены: устаревших цветов нет.\n");
}
