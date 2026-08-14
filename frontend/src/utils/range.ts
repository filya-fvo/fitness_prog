export function rangeInts(from: number, to: number, step = 1): number[] {
  const out: number[] = [];
  for (let n = from; n <= to; n += step) out.push(n);
  return out;
}
