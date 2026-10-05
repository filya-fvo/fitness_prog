import { WheelPicker } from "@/components/WheelPicker";
import { rangeInts } from "@/utils/range";

type Props = {
  label: string;
  hint: string | null;
  whole: number;
  tenth: number;
  onChange: (whole: number, tenth: number) => void;
  previousWeight?: number | null;
  displayWeight?: number;
};

export function SetWeightSelector({ label, hint, whole, tenth, onChange, previousWeight, displayWeight }: Props) {
  const weight = whole + tenth / 10;
  const display = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: displayWeight == null ? 1 : 6 }).format(displayWeight ?? weight);

  function adjust(delta: number) {
    const next = Math.max(0, Math.min(300, Math.round((weight + delta) * 10) / 10));
    onChange(Math.floor(next), Math.round((next % 1) * 10));
  }

  return <div className="app-card app-card-inset min-w-0 flex-[2] p-2">
    <p className="mb-1 text-center text-xs text-tg-hint">{label}</p>
    <div className="flex gap-1">
      <WheelPicker label="Кг" value={whole} options={rangeInts(0, 300)} onChange={(next) => onChange(next, tenth)} />
      <WheelPicker label="0,1 кг" value={tenth} options={rangeInts(0, 9)} onChange={(next) => onChange(whole, next)} className="max-w-[72px]" />
    </div>
    <p className="mt-2 text-center text-lg font-semibold tabular-nums">{display} кг</p>
    <div className="mt-2 grid grid-cols-3 gap-1">
      <button type="button" onClick={() => adjust(-2.5)} className="min-h-11 rounded-lg bg-tg-bg text-xs text-tg-text">−2,5</button>
      <button type="button" onClick={() => onChange(0, 0)} className="min-h-11 rounded-lg bg-tg-bg text-xs text-tg-text">0 кг</button>
      <button type="button" onClick={() => adjust(2.5)} className="min-h-11 rounded-lg bg-tg-bg text-xs text-tg-text">+2,5</button>
    </div>
    {previousWeight != null && previousWeight > 0 ? <p className="mt-2 text-center text-[11px] text-tg-link">Прошлый вес: {previousWeight} кг</p> : null}
    {hint ? <p className="mt-2 text-center text-[11px] leading-snug text-tg-hint">{hint}</p> : null}
  </div>;
}
