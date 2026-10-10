import { z } from "zod";

/** Small compatibility schema: loading web settings must not load native plans. */
export const androidDeliveryStateSchema = z.object({
  enabled: z.boolean(), device_id: z.string().uuid().nullable(),
  revision: z.number().int().nonnegative(),
  confirmed_at: z.string().datetime({ offset: true })
    .refine((value) => /(?:Z|\+00:00)$/.test(value)).nullable(),
}).strict();
