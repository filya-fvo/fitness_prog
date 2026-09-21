import { useState } from "react";

import {
  chooseIllnessRecovery,
  endIllnessPause,
  startIllnessPause,
  type IllnessPause,
} from "@/api/workouts";
import { confirmAction } from "@/lib/telegram";
import { toUserMessage } from "@/utils/errors";

type Props = {
  status: IllnessPause | null;
  disabled?: boolean;
  onChange: (status: IllnessPause) => void | Promise<void>;
};

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" })
    .format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

export function IllnessPauseCard({ status, disabled = false, onChange }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status) return null;

  async function run(action: () => Promise<IllnessPause>) {
    if (saving || disabled) return;
    setSaving(true);
    setError(null);
    try {
      await onChange(await action());
    } catch (err) {
      setError(toUserMessage(err, "Не удалось изменить паузу"));
    } finally {
      setSaving(false);
    }
  }

  async function start() {
    const accepted = await confirmAction(
      "Поставить тренировки на паузу? Дни болезни не будут считаться пропусками, а программа сохранит порядок.",
    );
    if (accepted) await run(startIllnessPause);
  }

  if (status.active) {
    return (
      <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4">
        <p className="text-sm font-semibold">Тренировки на паузе</p>
        <p className="mt-1 text-xs leading-5 text-tg-hint">
          Болезнь отмечена с {formatDate(status.started_on)}. Тренировки остаются в плане,
          напоминания отключены, пропуски не начисляются.
        </p>
        <button
          type="button"
          disabled={saving || disabled}
          onClick={() => void run(endIllnessPause)}
          className="mt-3 min-h-11 w-full rounded-xl bg-tg-button px-4 text-sm font-semibold text-tg-button-text disabled:opacity-50"
        >
          {saving ? "Сохраняем…" : "Я выздоровел(а)"}
        </button>
        {error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  if (status.recovery_choice_pending) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <p className="text-sm font-semibold">Как вернуться к тренировкам?</p>
        <p className="mt-1 text-xs leading-5 text-tg-hint">
          Рекомендуем один лёгкий проход программы с запасом повторений, затем среднюю неделю.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={saving || disabled} onClick={() => void run(() => chooseIllnessRecovery("light_week"))} className="min-h-11 rounded-xl bg-tg-button px-3 text-xs font-semibold text-tg-button-text disabled:opacity-50">
            Начать с лёгкой недели
          </button>
          <button type="button" disabled={saving || disabled} onClick={() => void run(() => chooseIllnessRecovery("normal"))} className="min-h-11 rounded-xl bg-tg-secondary px-3 text-xs font-medium text-tg-link disabled:opacity-50">
            Продолжить обычный цикл
          </button>
        </div>
        {error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  if (status.recovery_light_week_active) {
    return (
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
        <p className="text-sm font-semibold">Восстановительная лёгкая неделя</p>
        <p className="mt-1 text-xs leading-5 text-tg-hint">
          Для текущего прохода программы выбран лёгкий вес. После него начнётся средняя неделя.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-tg-secondary p-3">
      <button type="button" disabled={saving || disabled} onClick={() => void start()} className="min-h-11 w-full rounded-xl px-3 text-sm font-medium text-tg-link disabled:opacity-50">
        {saving ? "Сохраняем…" : "Приболел(а)? Поставить тренировки на паузу"}
      </button>
      {error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
