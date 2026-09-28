import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";

import type { AuthUser } from "@/api/auth";
import type { UserProfile } from "@/api/users";
import { ProfileHeroCard } from "./ProfileHeroCard";

const user = { id: "9a9ad846-ef8b-4e99-89c2-8edaa46c0033", username: "Filatov_Slava", subscription_status: "free", onboarding_completed: true } as AuthUser;

it("shows saved weight and height without inventing missing statistics", () => {
  const profile = {
    ...user,
    anthropometry: { weight_kg: 78.4, height_cm: 182 },
    goals: {}, stars_balance: 0,
  } as UserProfile;
  const markup = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(ProfileHeroCard, { user, profile })));

  expect(markup).toContain("78,4 кг");
  expect(markup).toContain("182 см");
  expect(markup).toContain("@Filatov_Slava");
  expect(markup).toContain('href="/profile/settings"');
});

it("invites profile completion when anthropometry has not been saved", () => {
  const markup = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(ProfileHeroCard, { user, profile: null })));
  expect(markup).toContain("Добавить данные");
  expect(markup).not.toContain("78,4 кг");
  expect(markup).not.toContain("182 см");
});
