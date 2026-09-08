import { z } from "zod";

export const entitlementSourceSchema = z.enum([
  "beta_grant",
  "legacy_stars",
  "admin",
  "qa",
  "telegram_stars",
  "web_payment",
  "corporate",
  "promo",
  "partner",
]);

export const subscriptionStateSchema = z.object({
  tier: z.enum(["free", "plus"]),
  active: z.boolean(),
  sources: z.array(entitlementSourceSchema),
  valid_until: z.string().datetime({ offset: true }).nullable(),
});

export type SubscriptionState = z.infer<typeof subscriptionStateSchema>;
