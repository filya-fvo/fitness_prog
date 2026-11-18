import { WheelPicker } from "@/components/WheelPicker";
import { DecimalInput } from "@/components/DecimalInput";
import { rangeInts } from "@/utils/range";
import { useState } from "react";

type Props = {
  label: string;
  hint: string | null;
  whole: number;
  tenth: number;
  onChange: (whole: number, tenth: number, exact?: number) => void;
  previousWeight?: number | null;
  displayWeight?: number;
  onValidityChange?: (valid: boolean) => void;
};

export function SetWeightSelector({ label, hint, whole, tenth, onChange, previousWeight, displayWeight, onValidityChange }: Props) {
  const weight = displayWeight ?? whole + tenth / 10;
  const [precise, setPrecise] = useState(String(weight));
  const [valid, setValid] = useState(true);
  const display = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: displayWeight == null ? 1 : 6 }).format(displayWeight ?? weight);
  const hundredth = Math.round(weight * 100) % 10;
  const wholeOptions = whole <= 300 ? rangeInts(0, 350) : [...rangeInts(0, 300), ...rangeInts(Math.max(301, whole - 80), Math.min(10000, whole + 80))];

  function select(value: number) {
    const next = Math.max(0, Math.min(10000, Math.round(value * 100) / 100));
    setPrecise(String(next)); setValid(true); onValidityChange?.(true);
    onChange(Math.floor(next), Math.floor((next % 1) * 10 + 1e-8), next);
  }
  function adjust(delta: number) { select(weight + delta); }

  return <div className="app-card app-card-inset min-w-0 flex-[2] p-2">
    <p className="mb-1 text-center text-xs text-tg-hint">{label}</p>
    <div className="flex gap-1">
      <WheelPicker label="Кг" value={whole} options={wholeOptions} onChange={(next) => select(next + tenth / 10 + hundredth / 100)} />
      <WheelPicker label="0,1 кг" value={tenth} options={rangeInts(0, 9)} onChange={(next) => select(whole + next / 10 + hundredth / 100)} className="max-w-[72px]" />
    </div>
    <p className="mt-2 text-center text-lg font-semibold tabular-nums">{display} кг</p>
    <label className="mt-2 block text-left text-xs text-tg-hint">Точный вес, кг
      <DecimalInput aria-label="Точный вес, кг" aria-invalid={!valid} value={precise} className="app-field mt-1 min-h-11 w-full text-base" onValueChange={value => {
        setPrecise(value);
        const ok = /^\d+(?:\.\d{0,2})?$/.test(value) && Number(value) <= 10000;
        setValid(ok); onValidityChange?.(ok);
        if (ok) select(Number(value));
      }} />
    </label>
    {!valid ? <p role="alert" className="mt-1 text-xs text-red-500">Укажите вес от 0 до 10000 с точностью до сотых.</p> : null}
    <div className="mt-2 grid grid-cols-3 gap-1">
      <button type="button" onClick={() => adjust(-2.5)} className="min-h-11 rounded-lg bg-tg-bg text-xs text-tg-text">−2,5</button>
      <button type="button" onClick={() => select(0)} className="min-h-11 rounded-lg bg-tg-bg text-xs text-tg-text">0 кг</button>
      <button type="button" onClick={() => adjust(2.5)} className="min-h-11 rounded-lg bg-tg-bg text-xs text-tg-text">+2,5</button>
    </div>
    {previousWeight != null && previousWeight > 0 ? <p className="mt-2 text-center text-[11px] text-tg-link">Прошлый вес: {previousWeight} кг</p> : null}
    {hint ? <p className="mt-2 text-center text-[11px] leading-snug text-tg-hint">{hint}</p> : null}
  </div>;
}
