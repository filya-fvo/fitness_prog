import type { ReminderCategory } from "@/api/androidNotifications";

export type PlatformNotificationStatus = {
  available: boolean; owner: string | null; deviceId: string | null;
  permission: "granted" | "prompt" | "denied"; exactAllowed: boolean;
  active: boolean; pending: boolean; preparedUntil: string | null; error: string | null;
  restEnabled: boolean; blockedCategories: ReminderCategory[];
};
export type TimerNotification = {
  owner: string; clientWorkoutId: string; generation: string; endsAtMs: number;
};
export interface NotificationPlatform {
  status(): Promise<PlatformNotificationStatus>;
  requestPermission(): Promise<PlatformNotificationStatus>;
  enable(): Promise<void>;
  disable(): Promise<void>;
  test(): Promise<void>;
  requestExactAlarmAccess(): Promise<void>;
  setRestEnabled(enabled: boolean): Promise<void>;
  setTimer(input: TimerNotification | null): Promise<void>;
}

export const unavailableNotificationStatus: PlatformNotificationStatus = {
  available: false, owner: null, deviceId: null, permission: "prompt", exactAllowed: false,
  active: false, pending: false, preparedUntil: null, error: null, restEnabled: false,
  blockedCategories: [],
};
const unsupported = async () => { throw new Error("Откройте настройки в приложении Android"); };
export const notificationPlatform: NotificationPlatform = {
  status: async () => ({ ...unavailableNotificationStatus, blockedCategories: [] }),
  requestPermission: async () => ({ ...unavailableNotificationStatus, blockedCategories: [] }),
  enable: unsupported, disable: unsupported, test: unsupported,
  requestExactAlarmAccess: unsupported, setRestEnabled: unsupported, setTimer: async () => undefined,
};
