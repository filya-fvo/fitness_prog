import { useMemo, useState } from "react";

import { WheelPicker, rangeInts } from "@/components/WheelPicker";
import type { Exercise, LocalSetDraft } from "@/types/workout";
import {
  type CardioMachineKind,
  type ExerciseLoadType,
  defaultTimedSeconds,
  formatDurationLabel,
  inferCardioMachineKind,
  inferLoadType,
} from "@/utils/exerciseLoadType";

type Props = {
  open: boolean;
  exercise: Exercise;
  /** Prefill from recommendation / last set */
  initial?: Partial<LocalSetDraft> | null;
  onClose: () => void;
  onApply: (draft: {
    reps: string;
    weight: string;
    durationSec: number | null;
    note: string | null;
    machineParams: Record<string, string | number> | null;
    restTimeSec: number;
    startTimer: boolean;
  }) => void;
  /** Manual timer without completing a set */
  onStartTimerOnly?: (seconds: number) => void;
  defaultRestSec?: number;
};

function splitWeight(w: number): { whole: number; tenth: number } {
  const r = Math.max(0, Math.round(w * 10) / 10);
  const whole = Math.floor(r);
  const tenth = Math.round((r - whole) * 10);
  return { whole, tenth: Math.min(9, Math.max(0, tenth)) };
}

export function AddSetModal({
  open,
  exercise,
  initial,
  onClose,
  onApply,
  onStartTimerOnly,
  defaultRestSec = 60,
}: Props) {
  const loadType: ExerciseLoadType = useMemo(() => inferLoadType(exercise), [exercise]);
  const machineKind: CardioMachineKind = useMemo(
    () => inferCardioMachineKind(exercise),
    [exercise],
  );

  const initWeight = Number(initial?.weight) || 0;
  const { whole: w0, tenth: t0 } = splitWeight(initWeight);
  const initReps = Math.max(0, Math.round(Number(initial?.reps) || 10));
  const initDur =
    Number(initial?.durationSec) ||
    defaultTimedSeconds(exercise);

  const [reps, setReps] = useState(initReps);
  const [kgWhole, setKgWhole] = useState(w0 || 20);
  const [kgTenth, setKgTenth] = useState(t0);
  const [min, setMin] = useState(Math.floor(initDur / 60));
  const [sec, setSec] = useState(initDur % 60);
  const [noteOpen, setNoteOpen] = useState(Boolean(initial?.note));
  const [note, setNote] = useState(String(initial?.note || ""));
  const [restSec, setRestSec] = useState(initial?.restTimeSec || defaultRestSec);
  const [startTimer, setStartTimer] = useState(true);

  // machine params
  const mp = (initial?.machineParams || {}) as Record<string, number>;
  const [speed, setSpeed] = useState(Number(mp.speed) || 6);
  const [incline, setIncline] = useState(Number(mp.incline) || 1);
  const [resistance, setResistance] = useState(Number(mp.resistance) || 5);
  const [cadence, setCadence] = useState(Number(mp.cadence) || 70);
  const [pace, setPace] = useState(Number(mp.pace) || 2.3);

  if (!open) return null;

  const durationSec = Math.max(0, min * 60 + sec);
  const weightStr =
    loadType === "weight_reps"
      ? (Math.round((kgWhole + kgTenth / 10) * 10) / 10).toFixed(kgTenth ? 1 : 0).replace(/\.0$/, "")
      : "";

  function machineParams(): Record<string, string | number> | null {
    if (loadType !== "cardio_machine") return null;
    if (machineKind === "treadmill") return { speed, incline };
    if (machineKind === "elliptical") return { resistance, speed };
    if (machineKind === "bike") return { resistance, cadence };
    if (machineKind === "rower") return { resistance, pace };
    return { resistance };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[#2a2a2e] p-4 text-white shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Добавить подход</h3>
          <button type="button" className="text-sm text-white/70" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="mb-3 text-xs text-white/60">{exercise.name_ru}</p>

        {loadType === "weight_reps" ? (
          <div className="flex gap-2">
            <WheelPicker label="Повторения" value={reps} options={rangeInts(1, 40)} onChange={setReps} />
            <WheelPicker label="кг" value={kgWhole} options={rangeInts(0, 300)} onChange={setKgWhole} />
            <WheelPicker
              label=""
              value={kgTenth}
              options={rangeInts(0, 9)}
              onChange={setKgTenth}
              format={(n) => String(n)}
              className="max-w-[72px]"
            />
          </div>
        ) : null}

        {loadType === "reps_only" ? (
          <div className="flex justify-center">
            <WheelPicker label="Повторения" value={reps} options={rangeInts(1, 50)} onChange={setReps} />
          </div>
        ) : null}

        {loadType === "timed" || loadType === "cardio_machine" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <WheelPicker label="Мин." value={min} options={rangeInts(0, 90)} onChange={setMin} />
              <WheelPicker label="Сек." value={sec} options={rangeInts(0, 59)} onChange={setSec} />
            </div>
            <p className="text-center text-xs text-white/50">
              {formatDurationLabel(durationSec)}
            </p>
            {loadType === "cardio_machine" ? (
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/25 p-3 text-xs">
                {machineKind === "treadmill" || machineKind === "other" ? (
                  <>
                    <label className="text-white/60">
                      Скорость
                      <input
                        type="number"
                        step={0.1}
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value) || 0)}
                        className="mt-1 w-full rounded-lg bg-black/30 px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="text-white/60">
                      Наклон
                      <input
                        type="number"
                        step={0.5}
                        value={incline}
                        onChange={(e) => setIncline(Number(e.target.value) || 0)}
                        className="mt-1 w-full rounded-lg bg-black/30 px-2 py-1.5 text-white"
                      />
                    </label>
                  </>
                ) : null}
                {machineKind === "elliptical" ? (
                  <>
                    <label className="text-white/60">
                      Уровень
                      <input
                        type="number"
                        value={resistance}
                        onChange={(e) => setResistance(Number(e.target.value) || 0)}
                        className="mt-1 w-full rounded-lg bg-black/30 px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="text-white/60">
                      Скорость
                      <input
                        type="number"
                        step={0.1}
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value) || 0)}
                        className="mt-1 w-full rounded-lg bg-black/30 px-2 py-1.5 text-white"
                      />
                    </label>
                  </>
                ) : null}
                {machineKind === "bike" ? (
                  <>
                    <label className="text-white/60">
                      Сопротивление
                      <input
                        type="number"
                        value={resistance}
                        onChange={(e) => setResistance(Number(e.target.value) || 0)}
                        className="mt-1 w-full rounded-lg bg-black/30 px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="text-white/60">
                      Каденс (об/мин)
                      <input
                        type="number"
                        value={cadence}
                        onChange={(e) => setCadence(Number(e.target.value) || 0)}
                        className="mt-1 w-full rounded-lg bg-black/30 px-2 py-1.5 text-white"
                      />
                    </label>
                  </>
                ) : null}
                {machineKind === "rower" ? (
                  <>
                    <label className="text-white/60">
                      Сопротивление
                      <input
                        type="number"
                        value={resistance}
                        onChange={(e) => setResistance(Number(e.target.value) || 0)}
                        className="mt-1 w-full rounded-lg bg-black/30 px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="text-white/60">
                      Темп /500 м
                      <input
                        type="number"
                        step={0.1}
                        value={pace}
                        onChange={(e) => setPace(Number(e.target.value) || 0)}
                        className="mt-1 w-full rounded-lg bg-black/30 px-2 py-1.5 text-white"
                      />
                    </label>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          {!noteOpen ? (
            <button
              type="button"
              className="text-xs text-white/70 underline"
              onClick={() => setNoteOpen(true)}
            >
              Добавить примечание
            </button>
          ) : (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Добавить примечание (по желанию)"
              rows={2}
              className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
          )}

          <div className="flex items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2 text-xs">
            <span className="text-white/70">Отдых после подхода</span>
            <select
              value={restSec}
              onChange={(e) => setRestSec(Number(e.target.value))}
              className="rounded-lg bg-black/40 px-2 py-1 text-white"
            >
              {[30, 45, 60, 75, 90, 120, 150, 180].map((s) => (
                <option key={s} value={s}>
                  {s < 60 ? `${s}с` : `${s / 60}м`}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={startTimer}
              onChange={(e) => setStartTimer(e.target.checked)}
            />
            Запустить таймер после «Применить»
          </label>

          {onStartTimerOnly ? (
            <button
              type="button"
              className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm"
              onClick={() =>
                onStartTimerOnly(
                  loadType === "timed" || loadType === "cardio_machine" ? durationSec || restSec : restSec,
                )
              }
            >
              ⏱ Только таймер
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className="mt-4 w-full rounded-full bg-white px-4 py-3 text-sm font-semibold text-black"
          onClick={() =>
            onApply({
              reps:
                loadType === "weight_reps" || loadType === "reps_only" ? String(reps) : "",
              weight: loadType === "weight_reps" ? weightStr : "",
              durationSec:
                loadType === "timed" || loadType === "cardio_machine" ? durationSec : null,
              note: note.trim() || null,
              machineParams: machineParams(),
              restTimeSec: restSec,
              startTimer,
            })
          }
        >
          Применить
        </button>
      </div>
    </div>
  );
}
