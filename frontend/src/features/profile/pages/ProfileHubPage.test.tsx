import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";

import { ProfileHubPage } from "./ProfileHubPage";

it("renders the profile hub without an application-wide query provider", () => {
  const markup = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(ProfileHubPage)));
  expect(markup).toContain("Профиль");
  expect(markup).toContain('href="/profile/settings"');
});
