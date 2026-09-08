import axios from "axios";
import { describe, expect, it } from "vitest";

import type { AuthUser } from "@/api/auth";
import {
  hasPlus,
  isPlusRequiredError,
  plusRequiredDetail,
} from "@/features/subscription/subscriptionAccess";

const BASE_USER: AuthUser = {
  id: "11111111-1111-4111-8111-111111111111",
  subscription_status: "free",
  onboarding_completed: true,
};

describe("subscription access", () => {
  it("uses the structured entitlement and supports old cached PLUS profiles", () => {
    expect(hasPlus({ ...BASE_USER, subscription_status: "plus" })).toBe(true);
    expect(hasPlus({
      ...BASE_USER,
      subscription_status: "plus",
      subscription: { tier: "free", active: false, sources: [], valid_until: null },
    })).toBe(false);
    expect(hasPlus({
      ...BASE_USER,
      subscription: { tier: "plus", active: true, sources: ["beta_grant"], valid_until: null },
    })).toBe(true);
  });

  it("recognizes only the stable structured PLUS denial", () => {
    const error = new axios.AxiosError("denied", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 403,
      statusText: "Forbidden",
      headers: {},
      config: { headers: new axios.AxiosHeaders() },
      data: {
        detail: {
          code: "plus_required",
          feature: "workout_history",
          message: "История тренировок доступна в PLUS",
        },
      },
    });
    expect(isPlusRequiredError(error)).toBe(true);
    expect(plusRequiredDetail(error)?.feature).toBe("workout_history");
    expect(isPlusRequiredError(new Error("403"))).toBe(false);
  });
});
