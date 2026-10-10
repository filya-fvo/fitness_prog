import { z } from "zod";
import { apiClient } from "@/api/client";
import { androidDeliveryStateSchema } from "@/api/androidDeliverySchema";
export { androidDeliveryStateSchema } from "@/api/androidDeliverySchema";

const utc = z.string().datetime({ offset: true }).refine((value) => /(?:Z|\+00:00)$/.test(value));
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const stamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
});
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
const timezone = z.string().max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; }
  catch { return false; }
});

export const androidDeliveryUpdateSchema = z.object({
  operation_id: z.string().uuid(), device_id: z.string().uuid(), enabled: z.boolean(),
  expected_revision: z.number().int().nonnegative(),
  expected_settings_revision: fingerprint.nullable().optional(),
}).strict().refine((input) => !input.enabled || Boolean(input.expected_settings_revision));

const reminderSchema = z.object({
  key: z.string().min(1).max(200),
  category: z.enum(["workouts", "supplements", "water", "calories", "measurements"]),
  due_at: utc, expires_at: utc, local_date: localDate,
  route: z.enum(["home", "workouts", "supplements", "nutrition", "measurements"]),
  context: z.object({
    occurrence_date: localDate.nullable().optional(),
    occurrence_key: z.string().max(200).nullable().optional(),
    slot: z.string().max(40).nullable().optional(),
    supplement_entry_ids: z.array(z.string().min(1).max(200)).max(500).default([]),
    starts_at: utc.nullable().optional(), zero_lead: z.boolean().nullable().optional(),
  }).strict().default({ supplement_entry_ids: [] }),
}).strict().refine((event) => Date.parse(event.expires_at) > Date.parse(event.due_at));

export const androidNotificationPlanSchema = z.object({
  owner: z.string().uuid(), schema_version: z.literal(1), settings_revision: fingerprint,
  generated_at: utc, valid_until: utc, timezone, catch_up: z.boolean(),
  quiet_hours: z.object({ enabled: z.boolean(), start_time: time, end_time: time }).strict(),
  events: z.array(reminderSchema).max(2048),
}).strict().superRefine((plan, ctx) => {
  const invalid = () => ctx.addIssue({ code: "custom", message: "Некорректный план напоминаний" });
  const until = Date.parse(plan.valid_until);
  if (until <= Date.parse(plan.generated_at)) invalid();
  const keys = new Set<string>();
  let previous: z.infer<typeof reminderSchema> | undefined;
  for (const event of plan.events) {
    const due = Date.parse(event.due_at);
    const formatter = new Intl.DateTimeFormat("sv-SE", { timeZone: plan.timezone,
      year: "numeric", month: "2-digit", day: "2-digit" });
    if (keys.has(event.key) || due >= until || Date.parse(event.expires_at) > until
      || formatter.format(due) !== event.local_date) invalid();
    if (previous && (Date.parse(previous.due_at) > due
      || (Date.parse(previous.due_at) === due && previous.key > event.key))) invalid();
    keys.add(event.key);
    previous = event;
  }
});

export type AndroidReminder = z.infer<typeof reminderSchema>;
export type ReminderCategory = AndroidReminder["category"];
export type AndroidNotificationPlan = z.infer<typeof androidNotificationPlanSchema>;
export type AndroidDeliveryState = z.infer<typeof androidDeliveryStateSchema>;
export type AndroidDeliveryUpdate = z.infer<typeof androidDeliveryUpdateSchema>;

export async function fetchAndroidNotificationPlan(): Promise<AndroidNotificationPlan> {
  const { data } = await apiClient.get<unknown>("/notifications/android-plan");
  if (new TextEncoder().encode(JSON.stringify(data)).byteLength > 1024 * 1024) {
    throw new Error("План напоминаний слишком большой");
  }
  return androidNotificationPlanSchema.parse(data);
}

export async function saveAndroidDelivery(input: AndroidDeliveryUpdate): Promise<AndroidDeliveryState> {
  const body = androidDeliveryUpdateSchema.parse(input);
  const { data } = await apiClient.put("/notifications/android-delivery", body);
  return z.object({ android_delivery: androidDeliveryStateSchema }).parse(data).android_delivery;
}
