import { describe, expect, it } from "vitest";

import { adminAuditObjectHref } from "../adminAuditLinks";

describe("adminAuditObjectHref", () => {
  const id = "00000000-0000-4000-8000-000000000001";

  it.each([
    ["user", `/admin/users/${id}`],
    ["exercise", `/admin/exercises?focus=${id}`],
    ["program", `/admin/programs?focus=${id}`],
    ["broadcast", `/admin/broadcasts?focus=${id}`],
  ])("links %s audit objects to their exact admin screen", (type, expected) => {
    expect(adminAuditObjectHref(type, id)).toBe(expected);
  });

  it("does not create a misleading link for unsupported objects", () => {
    expect(adminAuditObjectHref("audit_export", id)).toBeNull();
    expect(adminAuditObjectHref("exercise", null)).toBeNull();
  });
});
