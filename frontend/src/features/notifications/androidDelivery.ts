import type { NotificationPlatform } from "@/lib/notificationPlatform";

export async function enableAndroidDelivery(platform: NotificationPlatform) {
  const permission = await platform.requestPermission();
  if (permission.permission !== "granted") throw new Error("Разрешите уведомления в настройках телефона");
  await platform.enable();
  return platform.status();
}

export function deliverySettingsPatch<T extends { delivery_channel: "telegram" | "browser" }>(
  input: T, androidSelected: boolean, explicitLegacySwitch: boolean,
): Partial<T> {
  if (!androidSelected || explicitLegacySwitch) return input;
  const patch: Partial<T> = { ...input };
  delete patch.delivery_channel;
  return patch;
}
