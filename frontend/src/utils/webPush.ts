import {
  fetchPushConfig,
  removePushSubscription,
  savePushSubscription,
  type PushConfig,
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

function uint8ArrayToBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function applicationServerKeyMatches(
  subscription: PushSubscription,
  publicKey: string,
): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  return uint8ArrayToBase64Url(new Uint8Array(current)) === publicKey.replace(/=+$/, "");
}

async function subscribe(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(publicKey),
  });
}

export async function reconcileWebPush(config: PushConfig): Promise<boolean> {
  if (!config.enabled || !config.public_key || !webPushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !applicationServerKeyMatches(subscription, config.public_key)) {
    await removePushSubscription(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    if (Notification.permission !== "granted") return false;
    subscription = await subscribe(registration, config.public_key);
  }
  const saved = await savePushSubscription(subscription);
  return saved.subscriptions > 0;
}

export async function enableWebPush(config?: PushConfig): Promise<boolean> {
  if (!webPushSupported()) throw new Error("Этот браузер не поддерживает фоновые уведомления");
  const currentConfig = config ?? await fetchPushConfig();
  if (!currentConfig.enabled || !currentConfig.public_key) {
    throw new Error("Фоновые уведомления ещё не настроены администратором");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Разрешение на уведомления не выдано");
  return reconcileWebPush(currentConfig);
}

export async function disableWebPush(): Promise<void> {
  if (!webPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await removePushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}
