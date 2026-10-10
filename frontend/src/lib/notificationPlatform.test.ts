import { expect, it, vi } from "vitest";
import { notificationPlatform } from "@/lib/notificationPlatform";
import { enableAndroidDelivery, deliverySettingsPatch } from "@/features/notifications/androidDelivery";

it("web capabilities never request a native permission on load", async () => {
  expect(await notificationPlatform.status()).toMatchObject({ available: false, active: false, pending: false });
});
it("permission_denied_does_not_enable", async () => {
  const platform = { ...notificationPlatform,
    requestPermission: vi.fn().mockResolvedValue({ permission: "denied", active: false }), enable: vi.fn() };
  await expect(enableAndroidDelivery(platform)).rejects.toThrow();
  expect(platform.enable).not.toHaveBeenCalled();
});
it("pending_is_not_success", async () => {
  const platform = { ...notificationPlatform,
    requestPermission: vi.fn().mockResolvedValue({ permission: "granted" }),
    enable: vi.fn(), status: vi.fn().mockResolvedValue({ active: false, pending: true }) };
  expect(await enableAndroidDelivery(platform)).toMatchObject({ active: false, pending: true });
});
it("quiet_hours_save_does_not_send_legacy_channel", () => {
  expect(deliverySettingsPatch({ delivery_channel: "telegram", timezone: "Europe/Moscow" }, true, false))
    .toEqual({ timezone: "Europe/Moscow" });
});
it("explicit_legacy_switch_disables_android", () => {
  expect(deliverySettingsPatch({ delivery_channel: "browser" }, true, true)).toEqual({ delivery_channel: "browser" });
});
