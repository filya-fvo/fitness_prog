import type { NotificationSettings } from "@/api/notifications";
import { ServiceMessageConsentCard } from "@/features/profile/components/ServiceMessageConsentCard";
import {
  detectedTimezone,
  lastDeliveryLabel,
  timezoneLabel,
} from "@/features/notifications/notificationSettings";

const COMMON_TIMEZONES = [
  "Europe/Kaliningrad",
  "Europe/Moscow",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Omsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Yakutsk",
  "Asia/Vladivostok",
  "Asia/Magadan",
  "Asia/Kamchatka",
];

type Props = {
  settings: NotificationSettings;
  telegramAvailable: boolean;
  browserAvailable: boolean;
  browserEnabled: boolean;
  emailAvailable: boolean;
  lastDelivery: { channel: "telegram" | "browser"; delivered_at: string } | null;
  busy: boolean;
  onChange: (settings: NotificationSettings) => void;
  onSave: () => void;
  onToggleBrowser: () => void;
  onTest: () => void;
};

export function NotificationDeliveryCard(props: Props) {
  const { settings } = props;
  const detected = detectedTimezone();
  const timezones = Array.from(new Set([settings.timezone, detected, ...COMMON_TIMEZONES]));
  const testUnavailable = settings.delivery_channel === "telegram"
    ? !props.telegramAvailable
    : !props.browserEnabled;

  return (
    <section className="space-y-4 rounded-2xl bg-tg-secondary p-4" aria-labelledby="delivery-title">
      <div>
        <h2 id="delivery-title" className="text-sm font-semibold">Куда присылать</h2>
        <p className="mt-1 text-xs text-tg-hint">
          Один канал применяется ко всем включённым напоминаниям.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Канал уведомлений">
        {(["telegram", "browser"] as const).map((channel) => {
          const available = channel === "telegram" ? props.telegramAvailable : props.browserAvailable;
          const selected = settings.delivery_channel === channel;
          return (
            <button
              key={channel}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!available}
              onClick={() => props.onChange({ ...settings, delivery_channel: channel })}
              className={`min-h-11 rounded-xl px-3 text-sm font-medium disabled:opacity-40 ${
                selected ? "bg-tg-button text-tg-button-text" : "bg-tg-bg text-tg-text"
              }`}
            >
              {channel === "telegram" ? "Telegram" : "Браузер"}
            </button>
          );
        })}
      </div>

      {settings.delivery_channel === "browser" ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-tg-bg p-3">
          <p className="text-xs text-tg-hint">
            {props.browserEnabled ? "Этот браузер готов получать уведомления" : "Разрешите уведомления на этом устройстве"}
          </p>
          <button
            type="button"
            disabled={!props.browserAvailable || props.busy}
            onClick={props.onToggleBrowser}
            className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-semibold text-tg-link disabled:opacity-40"
          >
            {props.browserEnabled ? "Отключить" : "Включить"}
          </button>
        </div>
      ) : null}

      <label className="block text-xs text-tg-hint">
        Ваш часовой пояс
        <select
          value={settings.timezone}
          onChange={(event) => props.onChange({ ...settings, timezone: event.target.value })}
          className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base text-tg-text"
        >
          {timezones.map((timezone) => (
            <option key={timezone} value={timezone}>{timezoneLabel(timezone)}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-tg-hint">Определён устройством: {timezoneLabel(detected)}</p>
        <button
          type="button"
          onClick={() => props.onChange({ ...settings, timezone: detected })}
          className="min-h-11 shrink-0 text-xs font-medium text-tg-link"
        >
          Использовать
        </button>
      </div>

      <div className="space-y-3 rounded-xl bg-tg-bg p-3">
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
          <span>Тихие часы</span>
          <input
            type="checkbox"
            checked={settings.quiet_hours.enabled}
            onChange={(event) => props.onChange({
              ...settings,
              quiet_hours: { ...settings.quiet_hours, enabled: event.target.checked },
            })}
          />
        </label>
        {settings.quiet_hours.enabled ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-tg-hint">С
              <input
                type="time"
                value={settings.quiet_hours.start_time}
                onChange={(event) => props.onChange({
                  ...settings,
                  quiet_hours: { ...settings.quiet_hours, start_time: event.target.value },
                })}
                className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-secondary px-3 text-base"
              />
            </label>
            <label className="text-xs text-tg-hint">До
              <input
                type="time"
                value={settings.quiet_hours.end_time}
                onChange={(event) => props.onChange({
                  ...settings,
                  quiet_hours: { ...settings.quiet_hours, end_time: event.target.value },
                })}
                className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-secondary px-3 text-base"
              />
            </label>
          </div>
        ) : null}
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
          <span>
            Доставить позже
            <span className="mt-0.5 block text-xs font-normal text-tg-hint">Одно актуальное сообщение после паузы</span>
          </span>
          <input
            type="checkbox"
            checked={settings.catch_up}
            onChange={(event) => props.onChange({ ...settings, catch_up: event.target.checked })}
          />
        </label>
      </div>

      <ServiceMessageConsentCard
        emailAvailable={props.emailAvailable}
        emailEnabled={settings.service_messages.email_enabled}
        disabled={props.busy}
        onEmailEnabledChange={(enabled) => props.onChange({
          ...settings,
          service_messages: { email_enabled: enabled },
        })}
      />

      <p className="text-xs text-tg-hint">Последняя доставка: {lastDeliveryLabel(props.lastDelivery)}</p>
      <button
        type="button"
        disabled={props.busy}
        onClick={props.onSave}
        className="min-h-11 w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
      >
        {props.busy ? "Сохраняем…" : "Сохранить доставку и тишину"}
      </button>
      <button
        type="button"
        disabled={props.busy || testUnavailable}
        onClick={props.onTest}
        className="min-h-11 w-full rounded-xl bg-tg-bg px-4 py-3 text-sm font-semibold text-tg-text disabled:opacity-40"
      >
        Проверить: сообщение «Всё работает» → {settings.delivery_channel === "telegram" ? "Telegram" : "браузер"}
      </button>
    </section>
  );
}
