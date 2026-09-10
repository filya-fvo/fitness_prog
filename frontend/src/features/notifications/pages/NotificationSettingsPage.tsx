import { useEffect, useState } from "react";

import {
  fetchNotificationSettings,
  fetchPushConfig,
  saveNotificationSettings,
  sendNotificationTest,
  type NotificationSettings,
} from "@/api/notifications";
import { fetchSupplementStack } from "@/api/supplements";
import { fetchMyProfile } from "@/api/users";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { NotificationCategories } from "@/features/notifications/components/NotificationCategories";
import { NotificationDeliveryCard } from "@/features/notifications/components/NotificationDeliveryCard";
import { detectedTimezone } from "@/features/notifications/notificationSettings";
import { toUserMessage } from "@/utils/errors";
import {
  currentWebPushEnabled,
  disableWebPush,
  enableWebPush,
  webPushSupported,
} from "@/utils/webPush";

type Category = "workouts" | "water" | "calories" | "measurements" | "supplements";

export function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [telegramAvailable, setTelegramAvailable] = useState(false);
  const [browserAvailable, setBrowserAvailable] = useState(false);
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [supplementCount, setSupplementCount] = useState(0);
  const [lastDelivery, setLastDelivery] = useState<{
    channel: "telegram" | "browser";
    delivered_at: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [payload, profile, push, supplements] = await Promise.all([
          fetchNotificationSettings(),
          fetchMyProfile(),
          fetchPushConfig().catch(() => null),
          fetchSupplementStack().catch(() => ({ items: [], catalog: [] })),
        ]);
        if (cancelled) return;
        const canUseTelegram = profile.telegram_id != null;
        const canUseBrowser = Boolean(push?.enabled && webPushSupported());
        const currentSettings = payload.timezone_configured
          ? payload.settings
          : { ...payload.settings, timezone: detectedTimezone() };
        setSettings(
          !canUseTelegram && canUseBrowser && currentSettings.delivery_channel === "telegram"
            ? { ...currentSettings, delivery_channel: "browser" }
            : currentSettings,
        );
        setTelegramAvailable(canUseTelegram);
        setEmailAvailable(Boolean(profile.auth_email));
        setBrowserAvailable(canUseBrowser);
        setBrowserEnabled(canUseBrowser ? await currentWebPushEnabled().catch(() => false) : false);
        setSupplementCount(supplements.items.length);
        setLastDelivery(payload.last_delivery ?? null);
      } catch (caught) {
        if (!cancelled) setError(toUserMessage(caught, "Не удалось загрузить уведомления"));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function saveCategory(category: Category) {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const saved = await saveNotificationSettings({ [category]: settings[category] });
      setSettings((current) => current
        ? { ...current, [category]: saved.settings[category] }
        : saved.settings);
      setOk("Раздел сохранён");
    } catch (caught) {
      setError(toUserMessage(caught, "Не удалось сохранить раздел"));
    } finally {
      setBusy(false);
    }
  }

  async function saveDelivery(showMessage = true) {
    if (!settings) return false;
    if (settings.delivery_channel === "telegram" && !telegramAvailable) {
      setError("Telegram не подключён. Выберите браузер.");
      return false;
    }
    if (settings.delivery_channel === "browser" && !browserEnabled) {
      setError("Сначала включите уведомления в этом браузере.");
      return false;
    }
    if (
      settings.quiet_hours.enabled
      && settings.quiet_hours.start_time === settings.quiet_hours.end_time
    ) {
      setError("Начало и конец тихих часов должны отличаться.");
      return false;
    }
    setBusy(true);
    setError(null);
    if (showMessage) setOk(null);
    try {
      const saved = await saveNotificationSettings({
        timezone: settings.timezone || detectedTimezone(),
        delivery_channel: settings.delivery_channel,
        catch_up: settings.catch_up,
        quiet_hours: settings.quiet_hours,
        service_messages: settings.service_messages,
      });
      setSettings((current) => current ? {
        ...current,
        timezone: saved.settings.timezone,
        delivery_channel: saved.settings.delivery_channel,
        catch_up: saved.settings.catch_up,
        quiet_hours: saved.settings.quiet_hours,
        service_messages: saved.settings.service_messages,
      } : saved.settings);
      if (showMessage) setOk("Доставка и тихие часы сохранены");
      return true;
    } catch (caught) {
      setError(toUserMessage(caught, "Не удалось сохранить способ доставки"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggleBrowser() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (browserEnabled) await disableWebPush();
      else await enableWebPush();
      setBrowserEnabled(!browserEnabled);
      setOk(browserEnabled ? "Уведомления браузера отключены" : "Уведомления браузера включены");
    } catch (caught) {
      setError(toUserMessage(caught, "Не удалось изменить разрешение браузера"));
    } finally {
      setBusy(false);
    }
  }

  async function testDelivery() {
    if (!await saveDelivery(false)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await sendNotificationTest();
      setLastDelivery({ channel: result.channel, delivered_at: new Date().toISOString() });
      setOk(result.detail);
    } catch (caught) {
      setError(toUserMessage(caught, "Тестовое сообщение не доставлено"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <Header title="Уведомления" subtitle="Один канал и отдельные категории" />
      {error ? <p role="alert" className="mb-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p> : null}
      {ok ? <p role="status" className="mb-3 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-600">{ok}</p> : null}
      {!settings ? (
        error ? null : <PageSkeleton />
      ) : (
        <div className="space-y-5">
          <NotificationDeliveryCard
            settings={settings}
            telegramAvailable={telegramAvailable}
            browserAvailable={browserAvailable}
            browserEnabled={browserEnabled}
            emailAvailable={emailAvailable}
            lastDelivery={lastDelivery}
            busy={busy}
            onChange={setSettings}
            onSave={() => void saveDelivery()}
            onToggleBrowser={() => void toggleBrowser()}
            onTest={() => void testDelivery()}
          />
          <NotificationCategories
            settings={settings}
            supplementCount={supplementCount}
            busy={busy}
            onChange={setSettings}
            onSave={(category) => void saveCategory(category)}
          />
        </div>
      )}
    </section>
  );
}
