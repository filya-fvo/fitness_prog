import { useCallback, useEffect, useMemo, useState } from "react";

import { getStoredToken } from "@/api/client";
import {
  fetchBodyMeasurement,
  fetchBodyMeasurementRange,
  saveBodyMeasurement,
  type BodyMeasurement,
  type BodyMeasurementField,
} from "@/api/bodyMeasurements";
import { DecimalInput } from "@/components/DecimalInput";
import { Header } from "@/components/layout/Header";
import { toast } from "@/store/toastStore";
import { BODY_MEASURE_FIELDS } from "@/utils/energyTargets";
import { toUserMessage } from "@/utils/errors";
import { isOnline } from "@/utils/network";

function todayISO(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDate(iso: string, delta: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() + delta);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function displayDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${iso}T12:00:00`));
}

function valueText(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function deltaText(current: number | null | undefined, previous: number | null | undefined): string {
  if (current == null || previous == null) return "—";
  const delta = Math.round((current - previous) * 10) / 10;
  return `${delta > 0 ? "+" : ""}${String(delta).replace(".", ",")} см`;
}

function MeasurementChart({
  items,
  field,
}: {
  items: BodyMeasurement[];
  field: BodyMeasurementField;
}) {
  const points = items
    .filter((item) => item[field] != null)
    .slice(-12)
    .map((item) => ({ date: item.date, value: Number(item[field]) }));
  if (points.length < 2) {
    return <p className="mt-3 text-xs text-tg-hint">Для графика нужны хотя бы два замера.</p>;
  }
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const polyline = points
    .map((point, index) => {
      const x = points.length === 1 ? 160 : 12 + (index / (points.length - 1)) * 296;
      const y = 105 - ((point.value - min) / span) * 85;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="mt-3 rounded-xl bg-tg-bg p-3">
      <svg viewBox="0 0 320 120" className="h-32 w-full" role="img" aria-label="Динамика замеров">
        <line x1="12" y1="105" x2="308" y2="105" stroke="currentColor" opacity="0.15" />
        <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="3" className="text-tg-button" />
        {points.map((point, index) => {
          const [x, y] = polyline.split(" ")[index].split(",");
          return <circle key={`${point.date}-${index}`} cx={x} cy={y} r="4" fill="currentColor" className="text-tg-button" />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-tg-hint">
        <span>{points[0].date.slice(5)}</span>
        <span>{min.toFixed(1).replace(".", ",")}–{max.toFixed(1).replace(".", ",")} см</span>
        <span>{points[points.length - 1].date.slice(5)}</span>
      </div>
    </div>
  );
}

export function MeasurementsPage() {
  const [date, setDate] = useState(todayISO);
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<BodyMeasurement[]>([]);
  const [chartField, setChartField] = useState<BodyMeasurementField>("waist_cm");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getStoredToken() || !isOnline()) {
      setLoading(false);
      setError("История замеров доступна после входа и подключения к сети");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [current, range] = await Promise.all([
        fetchBodyMeasurement(date),
        fetchBodyMeasurementRange({ days: 3650, end: todayISO() }),
      ]);
      const next: Record<string, string> = {};
      for (const field of BODY_MEASURE_FIELDS) {
        next[field.key] = valueText(current[field.key as BodyMeasurementField]);
      }
      setValues(next);
      setNote(current.note ?? "");
      setHistory(range.items);
    } catch (err) {
      setError(toUserMessage(err, "Не удалось загрузить замеры"));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentHistory = history.find((item) => item.date === date) ?? null;
  const previous = useMemo(
    () => [...history].reverse().find((item) => item.date < date) ?? null,
    [date, history],
  );

  async function save() {
    const payload: Partial<Record<BodyMeasurementField, number | null>> & { note?: string | null } = {
      note: note.trim() || null,
    };
    let filled = 0;
    for (const field of BODY_MEASURE_FIELDS) {
      const raw = values[field.key]?.trim() ?? "";
      const number = raw ? Number(raw) : null;
      if (number != null && (!Number.isFinite(number) || number < 1 || number > 500)) {
        toast(`Проверьте поле «${field.label}»`, "error");
        return;
      }
      if (number != null) filled += 1;
      payload[field.key as BodyMeasurementField] = number;
    }
    if (!filled && !note.trim()) {
      toast("Заполните хотя бы один замер", "error");
      return;
    }
    setSaving(true);
    try {
      await saveBodyMeasurement(date, payload);
      toast("Замеры сохранены");
      await load();
    } catch (err) {
      toast(toUserMessage(err, "Не удалось сохранить замеры"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <Header title="Замеры тела" subtitle="История обхватов и динамика" />

      <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl bg-tg-secondary p-2">
        <button type="button" onClick={() => setDate((value) => shiftDate(value, -1))} className="tap-target min-h-[44px] min-w-[44px] rounded-xl bg-tg-bg text-lg">‹</button>
        <div className="text-center">
          <p className="text-sm font-semibold">{date === todayISO() ? "Сегодня" : displayDate(date)}</p>
          {currentHistory ? <p className="text-[10px] text-tg-hint">замер сохранён</p> : <p className="text-[10px] text-tg-hint">новый замер</p>}
        </div>
        <button type="button" disabled={date >= todayISO()} onClick={() => setDate((value) => shiftDate(value, 1))} className="tap-target min-h-[44px] min-w-[44px] rounded-xl bg-tg-bg text-lg disabled:opacity-40">›</button>
      </div>

      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-2xl bg-tg-secondary p-4">
          <h2 className="text-sm font-semibold">Замеры на {date === todayISO() ? "сегодня" : displayDate(date)}</h2>
          <p className="mt-1 text-xs text-tg-hint">Заполняйте только те области, которые измерили.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {BODY_MEASURE_FIELDS.map((field) => (
              <label key={field.key} className="text-xs text-tg-hint">
                {field.label}
                <DecimalInput
                  min={1}
                  max={500}
                  value={values[field.key] ?? ""}
                  onValueChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
                  placeholder="—"
                  className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
                />
                {previous ? <span className="mt-0.5 block text-[10px]">к прошлому: {deltaText(Number(values[field.key]) || null, previous[field.key as BodyMeasurementField])}</span> : null}
              </label>
            ))}
          </div>
          <label className="mt-3 block text-xs text-tg-hint">
            Заметка
            <textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Например: утром, до завтрака" className="mt-1 min-h-20 w-full resize-y rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm" />
          </label>
          <button type="button" disabled={saving || loading || Boolean(error)} onClick={() => void save()} className="mt-3 min-h-[44px] w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50">
            {saving ? "Сохраняем…" : currentHistory ? "Обновить замер" : "Сохранить замер"}
          </button>
        </section>

        <section className="rounded-2xl bg-tg-secondary p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Динамика</h2>
              <p className="text-[11px] text-tg-hint">До 12 последних точек</p>
            </div>
            <select aria-label="Показатель на графике" value={chartField} onChange={(event) => setChartField(event.target.value as BodyMeasurementField)} className="rounded-lg bg-tg-bg px-2 py-1.5 text-xs">
              {BODY_MEASURE_FIELDS.map((field) => <option key={field.key} value={field.key}>{field.label.replace(", см", "")}</option>)}
            </select>
          </div>
          <MeasurementChart items={history} field={chartField} />

          <h3 className="mt-4 text-xs font-semibold">Последние записи</h3>
          {history.length ? (
            <div className="mt-2 space-y-2">
              {[...history].reverse().slice(0, 8).map((item) => (
                <button key={item.date} type="button" onClick={() => setDate(item.date)} className="w-full rounded-xl bg-tg-bg p-3 text-left">
                  <p className="text-xs font-medium">{displayDate(item.date)}</p>
                  <p className="mt-1 text-[11px] text-tg-hint">
                    {BODY_MEASURE_FIELDS.filter((field) => item[field.key as BodyMeasurementField] != null).slice(0, 3).map((field) => `${field.label.replace(", см", "")} ${item[field.key as BodyMeasurementField]}`).join(" · ") || "Только заметка"}
                  </p>
                </button>
              ))}
            </div>
          ) : <p className="mt-3 text-xs text-tg-hint">История появится после первого сохранения.</p>}
        </section>
      </div>
    </section>
  );
}
