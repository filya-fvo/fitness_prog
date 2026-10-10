import type { AndroidDeliveryState } from "@/api/androidNotifications";
import { useAndroidDelivery } from "@/features/notifications/hooks/useAndroidDelivery";

type Props = { selected: AndroidDeliveryState | null; onConfirmedChange: () => Promise<void> };

export function AndroidDeliveryCard({ selected, onConfirmedChange }: Props) {
  const { status, busy, error, message, run } = useAndroidDelivery(onConfirmedChange);
  if (!status.available && !selected?.enabled) return null;
  const until = status.preparedUntil ? new Date(status.preparedUntil).toLocaleDateString("ru-RU") : null;
  return (
    <section className="app-card app-card-indigo space-y-3 p-4" aria-labelledby="android-delivery-title">
      <h2 id="android-delivery-title" className="text-sm font-semibold">Приложение Android</h2>
      <p className="text-sm text-tg-hint">
        Подготовленные напоминания работают без интернета. Для первого включения нужна сеть.
      </p>
      {!status.available ? <p className="text-sm">Выбран телефон. Откройте приложение Android, чтобы проверить разрешение и подготовку.</p> : <>
        <p role="status" className="text-sm">
          {status.pending ? "Ожидается подтверждение сервера"
            : status.active ? "Включено на этом телефоне" : "На этом телефоне не включено"}
        </p>
        <p className="text-sm">Разрешение телефона: {status.permission === "granted" ? "получено" : "требуется"}</p>
        {until ? <p className="text-sm">Напоминания подготовлены до {until}</p> : null}
        {selected?.enabled && selected.device_id !== status.deviceId ? <p className="text-sm text-tg-hint">
          Выбран другой телефон. После переноса откройте старый телефон с интернетом, чтобы отменить его напоминания.
        </p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className="app-primary-action min-h-11 px-4 text-sm"
            onClick={() => void run(status.active || status.pending ? "disable" : "enable")}>
            {status.active || status.pending ? "Выключить на телефоне" : "Включить на этом телефоне"}
          </button>
          <button type="button" disabled={busy || status.permission !== "granted"}
            className="app-secondary-action min-h-11 px-4 text-sm" onClick={() => void run("test")}>Проверить уведомление</button>
          {status.permission !== "granted" ? <button type="button" disabled={busy}
            className="app-secondary-action min-h-11 px-4 text-sm" onClick={() => void run("permission")}>Разрешить уведомления</button> : null}
        </div>
        {status.active ? <div className="space-y-2 border-t border-tg-hint/20 pt-3">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={status.restEnabled} disabled={busy}
              onChange={(event) => void run("rest", event.target.checked)} />Уведомление об окончании отдыха
          </label>
          <p className="text-sm text-tg-hint">{status.exactAllowed ? "Точное время отдыха разрешено" : "Без дополнительного доступа уведомление об отдыхе может задержаться"}</p>
          {!status.exactAllowed ? <button type="button" disabled={busy}
            className="app-secondary-action min-h-11 px-4 text-sm" onClick={() => void run("exact")}>Разрешить точный таймер</button> : null}
        </div> : null}
        {status.blockedCategories.length ? <p className="text-sm text-tg-hint">Часть категорий отключена в настройках телефона.</p> : null}
      </>}
      {selected?.confirmed_at ? <p className="text-xs text-tg-hint">Выбор подтверждён: {new Date(selected.confirmed_at).toLocaleString("ru-RU")}</p> : null}
      {error || status.error ? <p role="alert" className="text-sm text-red-600">{error || status.error}</p> : null}
      {message ? <p role="status" className="text-sm">{message}</p> : null}
    </section>
  );
}
