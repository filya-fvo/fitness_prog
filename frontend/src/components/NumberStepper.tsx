type Props = {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  /** primary step (e.g. 1 kg or 1 rep) */
  step: number;
  /** optional fine step shown as smaller buttons (e.g. 0.1 kg) */
  fineStep?: number;
  fineLabel?: string;
  format?: (n: number) => string;
  parse?: (raw: string) => number;
  min?: number;
  unit?: string;
};

function defaultParse(raw: string): number {
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function defaultFormat(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function NumberStepper({
  label,
  value,
  disabled,
  onChange,
  step,
  fineStep,
  fineLabel,
  format = defaultFormat,
  parse = defaultParse,
  min = 0,
  unit,
}: Props) {
  function bump(delta: number) {
    if (disabled) return;
    const next = Math.max(min, Math.round((parse(value) + delta) * 10) / 10);
    onChange(format(next));
  }

  return (
    <label className="block text-xs text-tg-hint">
      {label}
      {unit ? ` (${unit})` : ""}
      <div className="mt-1 flex items-center gap-1">
        {fineStep != null ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => bump(-fineStep)}
            className="h-9 w-8 shrink-0 rounded-lg bg-tg-secondary text-xs font-semibold disabled:opacity-40"
            aria-label={`−${fineStep}`}
          >
            −{fineLabel || fineStep}
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={() => bump(-step)}
          className="h-9 w-9 shrink-0 rounded-lg bg-tg-secondary text-sm font-semibold disabled:opacity-40"
          aria-label={`−${step}`}
        >
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-tg-secondary px-2 text-center text-sm text-tg-text"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => bump(step)}
          className="h-9 w-9 shrink-0 rounded-lg bg-tg-secondary text-sm font-semibold disabled:opacity-40"
          aria-label={`+${step}`}
        >
          +
        </button>
        {fineStep != null ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => bump(fineStep)}
            className="h-9 w-8 shrink-0 rounded-lg bg-tg-secondary text-xs font-semibold disabled:opacity-40"
            aria-label={`+${fineStep}`}
          >
            +{fineLabel || fineStep}
          </button>
        ) : null}
      </div>
    </label>
  );
}
