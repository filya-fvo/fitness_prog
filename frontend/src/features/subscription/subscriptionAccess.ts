import type { AuthUser } from "@/api/auth";
export { isPlusRequiredError, plusRequiredDetail } from "@/api/subscriptionError";

export function hasPlus(user: AuthUser | null | undefined): boolean {
  if (user?.subscription) {
    return user.subscription.active && user.subscription.tier === "plus";
  }
  return user?.subscription_status === "plus" || user?.subscription_status === "pro_stars";
}

export function plusValidUntilText(user: AuthUser | null | undefined): string | null {
  const value = user?.subscription?.valid_until;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
