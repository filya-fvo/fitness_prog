import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";

import {
  ACTIVATION_CHECKLIST_ITEM_IDS,
  activationChecklistIsVisible,
  completedActivationItems,
  nextLocalDate,
  type ActivationChecklistItemId,
  type ActivationChecklistState,
  type ActivationSignal,
} from "@/features/onboarding/activationChecklist";
import { trackEvent } from "@/lib/analytics";
import { confirmAction } from "@/lib/telegram";
import { localDateKey } from "@/utils/progress";

type Props = {
  state: ActivationChecklistState | null;
  hasProgram: boolean;
  onSignals: (signals: ActivationSignal[]) => void;
  onSnooze: (until: string) => void;
  onDismiss: () => void;
  onViewPlan: () => void;
  onOpenCheckin: () => void;
};

const LABELS: Record<ActivationChecklistItemId, string> = {
  first_plan: "Посмотрите план первой тренировки",
  schedule: "Выберите постоянные дни",
  first_set: "Выполните первый подход",
  checkin: "Отметьте воду, сон или активность",
  measurement: "Добавьте первый замер или пропустите шаг",
  explore: "Откройте питание и помощь",
};

function ItemAction({
  id,
  hasProgram,
  onSignals,
  onViewPlan,
  onOpenCheckin,
}: Pick<Props, "hasProgram" | "onSignals" | "onViewPlan" | "onOpenCheckin"> & {
  id: ActivationChecklistItemId;
}) {
  const linkClass = "inline-flex min-h-[44px] items-center rounded-xl bg-tg-bg px-3 py-2 text-xs font-medium text-tg-link";
  if (id === "first_plan") {
    if (!hasProgram) return <Link to="/programs" className={linkClass}>Выбрать программу</Link>;
    return <button type="button" onClick={onViewPlan} className={linkClass}>Показать план</button>;
  }
  if (id === "schedule") {
    return <Link to="/profile?section=alerts" className={linkClass}>Настроить дни</Link>;
  }
  if (id === "first_set") return <Link to="/train" className={linkClass}>К тренировкам</Link>;
  if (id === "checkin") {
    return <button type="button" onClick={onOpenCheckin} className={linkClass}>Открыть чек-ин</button>;
  }
  if (id === "measurement") {
    return (
      <div className="flex flex-wrap gap-2">
        <Link to="/measurements" className={linkClass}>Добавить замер</Link>
        <button
          type="button"
          onClick={() => onSignals(["measurement_skipped"])}
          className="inline-flex min-h-[44px] items-center px-2 text-xs text-tg-hint"
        >
          Пропустить
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Link to="/nutrition" className={linkClass}>Питание</Link>
      <Link
        to="/faq?article=first-start"
        state={{ returnTo: "/" }}
        className={linkClass}
      >
        Помощь и FAQ
      </Link>
    </div>
  );
}

export function ActivationChecklistCard(props: Props) {
  const shownRef = useRef(false);
  const today = localDateKey(new Date());
  const completed = useMemo(
    () => completedActivationItems(props.state?.signals ?? []),
    [props.state?.signals],
  );
  const pending = ACTIVATION_CHECKLIST_ITEM_IDS.filter((item) => !completed.includes(item));
  const visibleItems = pending.slice(0, 3);
  const visible = activationChecklistIsVisible(props.state, today);

  useEffect(() => {
    if (!visible || shownRef.current) return;
    shownRef.current = true;
    trackEvent("activation_checklist_shown", { completed: completed.length });
  }, [completed.length, visible]);

  if (!visible || !props.state) return null;

  async function dismiss() {
    const accepted = await confirmAction(
      "Скрыть подсказки навсегда? Раздел «Помощь и FAQ» останется доступен во вкладке «Ещё».",
    );
    if (!accepted) return;
    trackEvent("activation_checklist_dismissed", { completed: completed.length });
    props.onDismiss();
  }

  return (
    <section aria-labelledby="activation-checklist-title" className="rounded-2xl border border-tg-button/25 bg-tg-secondary p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-tg-link">Первые шаги</p>
          <h2 id="activation-checklist-title" className="mt-0.5 text-base font-semibold">
            Освойте приложение
          </h2>
          <p className="mt-1 text-xs text-tg-hint">
            Выполнено {completed.length} из {ACTIVATION_CHECKLIST_ITEM_IDS.length}
          </p>
        </div>
        <span aria-hidden="true" className="rounded-full bg-tg-bg px-2.5 py-1 text-xs font-semibold text-tg-link">
          {completed.length}/{ACTIVATION_CHECKLIST_ITEM_IDS.length}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Знакомство с приложением"
        aria-valuemin={0}
        aria-valuemax={ACTIVATION_CHECKLIST_ITEM_IDS.length}
        aria-valuenow={completed.length}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-tg-bg"
      >
        <div
          className="h-full rounded-full bg-tg-button transition-[width]"
          style={{ width: `${completed.length / ACTIVATION_CHECKLIST_ITEM_IDS.length * 100}%` }}
        />
      </div>

      <ol className="mt-3 space-y-2">
        {visibleItems.map((item) => (
          <li key={item} className="rounded-xl bg-tg-bg/70 p-3">
            <div className="flex items-start gap-2.5">
              <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tg-button/15 text-xs font-semibold text-tg-link">
                {ACTIVATION_CHECKLIST_ITEM_IDS.indexOf(item) + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{LABELS[item]}</p>
                <div className="mt-2">
                  <ItemAction
                    id={item}
                    hasProgram={props.hasProgram}
                    onSignals={props.onSignals}
                    onViewPlan={props.onViewPlan}
                    onOpenCheckin={props.onOpenCheckin}
                  />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-tg-hint/15 pt-3">
        <button
          type="button"
          onClick={() => {
            trackEvent("activation_checklist_snoozed", { completed: completed.length });
            props.onSnooze(nextLocalDate(today));
          }}
          className="min-h-[44px] px-2 text-xs font-medium text-tg-link"
        >
          Напомнить завтра
        </button>
        <button type="button" onClick={() => void dismiss()} className="min-h-[44px] px-2 text-xs text-tg-hint">
          Скрыть навсегда
        </button>
      </div>
    </section>
  );
}
