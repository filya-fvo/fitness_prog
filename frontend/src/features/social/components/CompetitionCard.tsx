import type { Competition } from "@/api/social";

function formatDay(value: string | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}

const statusLabel: Record<Competition["status"], string> = {
  pending: "Ждёт подтверждения",
  active: "Идёт сейчас",
  finished: "Завершено",
  cancelled: "Завершено досрочно",
};

function percent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value}%`;
}

function rawProgress(result: NonNullable<Competition["my_analytics"]>["factors"][number]): string | null {
  if (result.baseline_value == null || result.latest_value == null || !result.unit) return null;
  return `${result.baseline_value} ${result.unit} → ${result.latest_value} ${result.unit}`;
}

type Props = {
  competition: Competition;
  busy: boolean;
  onAccept: () => Promise<void>;
  onLeave: () => Promise<void>;
};

export function CompetitionCard({ competition, busy, onAccept, onLeave }: Props) {
  const mine = competition.my_analytics;
  const friend = competition.friend_analytics;
  const resultLabel = competition.winner === "me" ? "Вы впереди" : competition.winner === "friend" ? `${competition.friend_label} впереди` : competition.winner === "tie" ? "Пока ничья" : "Ждём данные";

  return (
    <article className="rounded-xl bg-tg-bg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{competition.title || `С ${competition.friend_label}`}</h3>
          <p className="mt-1 text-xs text-tg-hint">{competition.duration_days} дней{competition.start_date ? ` · ${formatDay(competition.start_date)}–${formatDay(competition.end_date)}` : ""}</p>
        </div>
        <span className="shrink-0 rounded-full bg-tg-secondary px-2 py-1 text-xs text-tg-hint">{statusLabel[competition.status]}</span>
      </div>

      <ul className="mt-3 space-y-1 text-xs text-tg-hint">
        {competition.factors.map((factor) => <li key={factor.key}>• {factor.label}</li>)}
      </ul>

      {mine && friend ? (
        <div className="mt-3 rounded-xl bg-tg-secondary p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{resultLabel}</p>
            <p className="text-sm font-semibold">{mine.wins} : {friend.wins}</p>
          </div>
          <div className="mt-3 space-y-3">
            {mine.factors.map((myFactor) => {
              const friendFactor = friend.factors.find((item) => item.key === myFactor.key);
              return (
                <div key={myFactor.key} className="border-t border-black/5 pt-3 first:border-0 first:pt-0 dark:border-white/10">
                  <p className="text-xs font-medium">{myFactor.label}</p>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-xs text-tg-hint">Вы</span><p className="font-semibold">{percent(myFactor.value)}</p></div>
                    <div><span className="truncate text-xs text-tg-hint">{competition.friend_label}</span><p className="font-semibold">{percent(friendFactor?.value)}</p></div>
                  </div>
                  {myFactor.completed != null && myFactor.planned != null ? <p className="mt-1 text-xs text-tg-hint">Ваш план: {myFactor.completed} из {myFactor.planned}</p> : null}
                  {rawProgress(myFactor) ? <p className="mt-1 text-xs text-tg-hint">Ваши данные: {rawProgress(myFactor)}</p> : null}
                  {myFactor.status !== "ready" || friendFactor?.status !== "ready" ? <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">Для расчёта нужны новые записи обоих участников.</p> : null}
                  {myFactor.capped || friendFactor?.capped ? <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">Аномальный скачок ограничен формулой.</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {competition.status === "pending" ? (
        <p className="mt-3 text-sm text-tg-hint">{competition.created_by_me ? "Ждём согласия друга." : "Проверьте срок и факторы. Старт и фиксация исходных значений произойдут только после вашего согласия."}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {competition.can_accept ? <button type="button" disabled={busy} onClick={() => void onAccept()} className="min-h-11 rounded-xl bg-tg-button px-4 text-sm font-semibold text-tg-button-text disabled:opacity-50">Принять</button> : null}
        {competition.status === "pending" || competition.status === "active" ? <button type="button" disabled={busy} onClick={() => void onLeave()} className="min-h-11 rounded-xl bg-tg-secondary px-4 text-sm text-red-500 disabled:opacity-50">{competition.status === "pending" ? "Отказаться" : "Выйти"}</button> : null}
      </div>
    </article>
  );
}
