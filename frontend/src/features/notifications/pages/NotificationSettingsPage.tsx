import { useEffect, useRef, useState } from "react";
import type { AndroidDeliveryState } from "@/api/androidNotifications";
import { AndroidDeliveryCard } from "@/features/notifications/components/AndroidDeliveryCard";
import { deliverySettingsPatch } from "@/features/notifications/androidDelivery";

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
  disableWebPush,
  enableWebPush,
  reconcileWebPush,
  webPushSupported,
} from "@/utils/webPush";

type Category = "workouts" | "water" | "calories" | "measurements" | "supplements";

export function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [androidDelivery, setAndroidDelivery] = useState<AndroidDeliveryState | null>(null);
  const [explicitLegacySwitch, setExplicitLegacySwitch] = useState(false);
  const [telegramAvailable, setTelegramAvailable] = useState(false);
  const [browserAvailable, setBrowserAvailable] = useState(false);
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const [browserUnavailableReason, setBrowserUnavailableReason] = useState<string | null>(null);
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [supplementCount, setSupplementCount] = useState(0);
  const [lastDelivery, setLastDelivery] = useState<{
    channel: "telegram" | "browser";
    delivered_at: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [quietHoursSubmitted, setQuietHoursSubmitted] = useState(false);
  const quietHoursEndRef = useRef<HTMLInputElement>(null);
  const browserStateVersion = useRef(0);
  const quietHoursInvalid = Boolean(settings?.quiet_hours.enabled
    && settings.quiet_hours.start_time === settings.quiet_hours.end_time);

  useEffect(() => {
    let cancelled = false;
    const browserVersion = ++browserStateVersion.current;
    setError(null);
    async function load() {
      try {
        const [payload, profile, push, supplements] = await Promise.all([
          fetchNotificationSettings(),
          fetchMyProfile(),
          fetchPushConfig().catch(() => null),
          fetchSupplementStack().catch(() => ({ items: [], catalog: [] })),
        ]);
        const canUseTelegram = profile.telegram_id != null;
        const browserSupported = webPushSupported();
        const canUseBrowser = Boolean(push?.enabled && browserSupported);
        if (cancelled) return;
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
        setBrowserUnavailableReason(
          !browserSupported
            ? "Откройте приложение в обычном браузере: Telegram не поддерживает Web Push."
            : !push?.enabled
              ? "Браузерные уведомления временно недоступны."
              : null,
        );
        setBrowserEnabled(false);
        setSupplementCount(supplements.items.length);
        setLastDelivery(payload.last_delivery ?? null);
        setAndroidDelivery(payload.android_delivery ?? null);
        setExplicitLegacySwitch(false);
        if (canUseBrowser && push) {
          const enabled = await reconcileWebPush(push).catch(() => false);
          if (!cancelled && browserStateVersion.current === browserVersion) setBrowserEnabled(enabled);
        }
      } catch (caught) {
        if (!cancelled) setError(toUserMessage(caught, "Не удалось загрузить уведомления"));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

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
      window.dispatchEvent(new Event("fitness:notification-settings-updated"));
    } catch (caught) {
      setError(toUserMessage(caught, "Не удалось сохранить раздел"));
    } finally {
      setBusy(false);
    }
  }

  async function saveDelivery(showMessage = true) {
    if (!settings) return false;
    if ((!androidDelivery?.enabled || explicitLegacySwitch) && settings.delivery_channel === "telegram" && !telegramAvailable) {
      setError("Telegram не подключён. Выберите браузер.");
      return false;
    }
    if ((!androidDelivery?.enabled || explicitLegacySwitch) && settings.delivery_channel === "browser" && !browserEnabled) {
      setError("Сначала включите уведомления в этом браузере.");
      return false;
    }
    if (quietHoursInvalid) {
      setQuietHoursSubmitted(true);
      setError(null);
      quietHoursEndRef.current?.focus();
      quietHoursEndRef.current?.scrollIntoView({ block: "center" });
      return false;
    }
    setBusy(true);
    setError(null);
    if (showMessage) setOk(null);
    try {
      const saved = await saveNotificationSettings(deliverySettingsPatch({
        timezone: settings.timezone || detectedTimezone(),
        delivery_channel: settings.delivery_channel,
        catch_up: settings.catch_up,
        quiet_hours: settings.quiet_hours,
        service_messages: settings.service_messages,
      }, Boolean(androidDelivery?.enabled), explicitLegacySwitch));
      setAndroidDelivery(saved.android_delivery ?? null);
      setExplicitLegacySwitch(false);
      setSettings((current) => current ? {
        ...current,
        timezone: saved.settings.timezone,
        delivery_channel: saved.settings.delivery_channel,
        catch_up: saved.settings.catch_up,
        quiet_hours: saved.settings.quiet_hours,
        service_messages: saved.settings.service_messages,
      } : saved.settings);
      window.dispatchEvent(new Event("fitness:notification-settings-updated"));
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
    browserStateVersion.current += 1;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (browserEnabled) await disableWebPush();
      else if (!await enableWebPush()) throw new Error("Не удалось зарегистрировать этот браузер");
      setBrowserEnabled(!browserEnabled);
      setOk(browserEnabled ? "Уведомления браузера отключены" : "Уведомления браузера включены");
    } catch (caught) {
      setError(toUserMessage(caught, "Не удалось изменить разрешение браузера"));
    } finally {
      setBusy(false);
    }
  }

  async function testDelivery() {
    if (androidDelivery?.enabled && !explicitLegacySwitch) {
      setError("Проверьте уведомление в приложении Android");
      return;
    }
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
      {ok ? <p role="status" className="app-card app-card-success mb-3 p-3 text-sm">{ok}</p> : null}
      {!settings ? (
        error ? (
          <button type="button" className="app-secondary-action min-h-11 px-4 text-sm" onClick={() => setReloadKey((key) => key + 1)}>
            Повторить загрузку
          </button>
        ) : <PageSkeleton />
      ) : (
        <div className="space-y-5">
          <AndroidDeliveryCard selected={androidDelivery} onConfirmedChange={async () => {
            const payload = await fetchNotificationSettings();
            setAndroidDelivery(payload.android_delivery ?? null);
          }} />
          <NotificationDeliveryCard
            settings={settings}
            telegramAvailable={telegramAvailable}
            browserAvailable={browserAvailable}
            browserEnabled={browserEnabled}
            browserUnavailableReason={browserUnavailableReason}
            emailAvailable={emailAvailable}
            lastDelivery={lastDelivery}
            busy={busy}
            androidSelected={Boolean(androidDelivery?.enabled && !explicitLegacySwitch)}
            onSelectLegacy={() => setExplicitLegacySwitch(true)}
            onChange={setSettings}
            onSave={() => void saveDelivery()}
            onToggleBrowser={() => void toggleBrowser()}
            onTest={() => void testDelivery()}
            quietHoursError={quietHoursSubmitted && quietHoursInvalid ? "Начало и конец тихих часов должны отличаться." : null}
            quietHoursEndRef={quietHoursEndRef}
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
