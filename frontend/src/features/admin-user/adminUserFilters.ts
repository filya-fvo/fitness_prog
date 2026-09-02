export type AdminUserFilterForm = {
  q: string;
  subscriptionStatus: string;
  onboardingCompleted: string;
  level: string;
  primaryGoal: string;
};

export const EMPTY_USER_FILTERS: AdminUserFilterForm = {
  q: "",
  subscriptionStatus: "",
  onboardingCompleted: "",
  level: "",
  primaryGoal: "",
};

export const USER_FILTER_KEYS = Object.freeze(Object.keys(EMPTY_USER_FILTERS));
