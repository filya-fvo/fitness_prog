import { useCallback, useEffect, useRef, useState } from "react";
import { notificationPlatform, unavailableNotificationStatus } from "@/lib/notificationPlatform";
import { useUserStore } from "@/store/userStore";
import { toUserMessage } from "@/utils/errors";
import { enableAndroidDelivery } from "@/features/notifications/androidDelivery";

export function useAndroidDelivery(onConfirmedChange: () => Promise<void>) {
  const owner = useUserStore((state) => state.user?.id ?? null);
  const [status, setStatus] = useState(unavailableNotificationStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const epoch = useRef(0);
  const refresh = useCallback(async () => {
    const version = epoch.current;
    const next = await notificationPlatform.status();
    if (version === epoch.current) setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    epoch.current += 1;
    setStatus(unavailableNotificationStatus);
    setBusy(false);
    setError(null);
    setMessage(null);
    const update = () => { void refresh().catch(() => undefined); };
    const timerError = () => setError("Не удалось подготовить уведомление об отдыхе");
    update();
    window.addEventListener("focus", update);
    window.addEventListener("fitness:native-notifications-changed", update);
    window.addEventListener("fitness:notification-delivery-error", timerError);
    return () => {
      epoch.current += 1;
      window.removeEventListener("focus", update);
      window.removeEventListener("fitness:native-notifications-changed", update);
      window.removeEventListener("fitness:notification-delivery-error", timerError);
    };
  }, [owner, refresh]);

  async function run(action: "enable" | "disable" | "test" | "permission" | "exact" | "rest", enabled?: boolean) {
    const version = epoch.current;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (action === "enable") await enableAndroidDelivery(notificationPlatform);
      if (action === "disable") await notificationPlatform.disable();
      if (action === "test") await notificationPlatform.test();
      if (action === "permission") await notificationPlatform.requestPermission();
      if (action === "exact") await notificationPlatform.requestExactAlarmAccess();
      if (action === "rest") await notificationPlatform.setRestEnabled(Boolean(enabled));
      if (version !== epoch.current) return;
      const next = await refresh();
      if (version !== epoch.current) return;
      setMessage(action === "test" ? "Телефон принял тестовое уведомление"
        : next.pending ? "Ожидается подтверждение сервера"
          : action === "enable" && next.active ? "Напоминания на телефоне включены" : null);
      if (action === "enable" || action === "disable") await onConfirmedChange();
    } catch (caught) {
      if (version === epoch.current) {
        setError(toUserMessage(caught, "Не удалось изменить уведомления телефона"));
        await refresh().catch(() => undefined);
      }
    } finally { if (version === epoch.current) setBusy(false); }
  }
  return { status, busy, error, message, run };
}
