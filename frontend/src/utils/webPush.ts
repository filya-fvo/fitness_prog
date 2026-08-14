import {
  fetchPushConfig,
  removePushSubscription,
  savePushSubscription,
} from "@/api/notifications";

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function webPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function currentWebPushEnabled(): Promise<boolean> {
  if (!webPushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  return Boolean(await registration.pushManager.getSubscription());
}

export async function enableWebPush(): Promise<void> {
  if (!webPushSupported()) throw new Error("Этот браузер не поддерживает фоновые уведомления");
  const config = await fetchPushConfig();
  if (!config.enabled || !config.public_key) {
    throw new Error("Фоновые уведомления ещё не настроены администратором");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Разрешение на уведомления не выдано");
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.public_key),
    }));
  await savePushSubscription(subscription);
}

export async function disableWebPush(): Promise<void> {
  if (!webPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await removePushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}
