/**
 * Multi time-slot editor with native time inputs + special workout-relative slots.
 * Avoids free-text comma parsing issues on mobile.
 */
const SPECIAL = [
  { id: "pre_workout", label: "За 45 мин до тренировки" },
  { id: "during_workout", label: "Во время тренировки" },
  { id: "post_workout", label: "Через 30 мин после" },
] as const;

function isHhMm(v: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(v);
}

type Props = {
  times: string[];
  onChange: (times: string[]) => void;
};

export function TimeSlotsEditor({ times, onChange }: Props) {
  const list = times?.length ? times : [];

  function updateAt(idx: number, value: string) {
    const next = [...list];
    next[idx] = value;
    onChange(next);
  }

  function removeAt(idx: number) {
    onChange(list.filter((_, i) => i !== idx));
  }

  function addClock() {
    onChange([...list, "10:00"]);
  }

  function addSpecial(id: string) {
    if (list.includes(id)) return;
    onChange([...list, id]);
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-tg-text">Время приёма</p>
      {list.length === 0 ? (
        <p className="text-[11px] text-tg-hint">Слотов нет — добавьте время ниже.</p>
      ) : null}
      <ul className="space-y-2">
        {list.map((slot, idx) => {
          const special = SPECIAL.find((s) => s.id === slot);
          return (
            <li key={`${slot}-${idx}`} className="flex items-center gap-2">
              {special || !isHhMm(slot) ? (
                <select
                  value={special ? slot : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__clock__") updateAt(idx, "10:00");
                    else if (v) updateAt(idx, v);
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-tg-bg px-2 py-1.5 text-xs"
                >
                  {!special ? <option value="">Слот</option> : null}
                  {SPECIAL.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                  <option value="__clock__">Точное время…</option>
                </select>
              ) : (
                <input
                  type="time"
                  value={slot.length === 4 ? `0${slot}` : slot}
                  onChange={(e) => updateAt(idx, e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-tg-bg px-2 py-1.5 text-xs"
                />
              )}
              <button
                type="button"
                className="shrink-0 text-xs text-red-500"
                onClick={() => removeAt(idx)}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addClock}
          className="rounded-full bg-tg-bg px-3 py-1 text-[11px]"
        >
          + время
        </button>
        {SPECIAL.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={list.includes(s.id)}
            onClick={() => addSpecial(s.id)}
            className="rounded-full bg-tg-bg px-3 py-1 text-[11px] disabled:opacity-40"
          >
            + {s.label.split(" ")[0]}…
          </button>
        ))}
      </div>
    </div>
  );
}
