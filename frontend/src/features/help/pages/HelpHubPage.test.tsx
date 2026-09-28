import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";

import { HelpHubPage } from "./HelpHubPage";

it("offers three illustrated help destinations with direct actions", () => {
  const markup = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(HelpHubPage)));
  const cards = markup.match(/data-help-feature=/g) ?? [];
  const illustrations = markup.match(/data-help-illustration=/g) ?? [];

  expect(cards).toHaveLength(3);
  expect(illustrations).toHaveLength(3);
  expect(markup).toContain('href="/ai"');
  expect(markup).toContain('href="/support"');
  expect(markup).toContain('href="/faq"');
});
