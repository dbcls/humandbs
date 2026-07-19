import { describe, expect, test } from "bun:test";

import type { SessionUser } from "@/utils/jwt-helpers";

import { can } from "./permissions";

const admin: SessionUser = {
  id: "admin-1",
  email: "admin@example.com",
  name: "Admin",
  username: "admin",
  role: "admin",
};

// Non-admin user. Owners are now resolved server-side (JGA DB) and not surfaced
// on the research detail, so write access is admin-only — a plain user is read-only.
const nonAdmin: SessionUser = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  username: "user",
  role: "user",
};

const research = (status: "draft" | "review" | "published") => ({ status });

describe("can(researches:update) — admin-only, allows draft and published", () => {
  test("admin can update a draft research", () => {
    expect(
      can(admin, {
        resource: "researches",
        action: "update",
        params: { research: research("draft") },
      }).can,
    ).toBe(true);
  });

  test("admin can update (patch) a published research", () => {
    expect(
      can(admin, {
        resource: "researches",
        action: "update",
        params: { research: research("published") },
      }).can,
    ).toBe(true);
  });

  test("non-admin cannot update a published research", () => {
    expect(
      can(nonAdmin, {
        resource: "researches",
        action: "update",
        params: { research: research("published") },
      }).can,
    ).toBe(false);
  });

  test("cannot update a research in review status (wrong status)", () => {
    expect(
      can(admin, {
        resource: "researches",
        action: "update",
        params: { research: research("review") },
      }).can,
    ).toBe(false);
  });
});

describe("can(datasets:update) — admin-only, allows draft and published parent", () => {
  test("admin can update a dataset with a draft parent", () => {
    expect(
      can(admin, {
        resource: "datasets",
        action: "update",
        params: { research: research("draft") },
      }).can,
    ).toBe(true);
  });

  test("admin can update (patch) a dataset with a published parent", () => {
    expect(
      can(admin, {
        resource: "datasets",
        action: "update",
        params: { research: research("published") },
      }).can,
    ).toBe(true);
  });

  test("non-admin cannot update a dataset with a published parent", () => {
    expect(
      can(nonAdmin, {
        resource: "datasets",
        action: "update",
        params: { research: research("published") },
      }).can,
    ).toBe(false);
  });

  test("cannot update a dataset whose parent is in review (wrong status)", () => {
    expect(
      can(admin, {
        resource: "datasets",
        action: "update",
        params: { research: research("review") },
      }).can,
    ).toBe(false);
  });

  test("dataset delete still requires a draft parent (unchanged)", () => {
    expect(
      can(admin, {
        resource: "datasets",
        action: "delete",
        params: { research: research("published") },
      }).can,
    ).toBe(false);
    expect(
      can(admin, {
        resource: "datasets",
        action: "delete",
        params: { research: research("draft") },
      }).can,
    ).toBe(true);
  });
});
