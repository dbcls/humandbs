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

const owner: SessionUser = {
  id: "owner-1",
  email: "owner@example.com",
  name: "Owner",
  username: "owner",
  role: "user",
};

const stranger: SessionUser = {
  id: "stranger-1",
  email: "stranger@example.com",
  name: "Stranger",
  username: "stranger",
  role: "user",
};

// Research with `owner` in uids.
const ownedResearch = (status: "draft" | "review" | "published") => ({
  uids: [owner.id],
  status,
});

describe("can(researches:update) — loosened to allow published", () => {
  test("admin can update a draft research", () => {
    expect(
      can(admin, { resource: "researches", action: "update", params: { research: ownedResearch("draft") } }).can,
    ).toBe(true);
  });

  test("admin can update (patch) a published research", () => {
    expect(
      can(admin, { resource: "researches", action: "update", params: { research: ownedResearch("published") } })
        .can,
    ).toBe(true);
  });

  test("owner can update (patch) a published research they own", () => {
    expect(
      can(owner, { resource: "researches", action: "update", params: { research: ownedResearch("published") } })
        .can,
    ).toBe(true);
  });

  test("non-owner non-admin cannot update a published research", () => {
    expect(
      can(stranger, {
        resource: "researches",
        action: "update",
        params: { research: ownedResearch("published") },
      }).can,
    ).toBe(false);
  });

  test("cannot update a research in review status (wrong status)", () => {
    expect(
      can(admin, { resource: "researches", action: "update", params: { research: ownedResearch("review") } }).can,
    ).toBe(false);
  });
});

describe("can(datasets:update) — loosened to allow published parent", () => {
  test("admin can update a dataset with a draft parent", () => {
    expect(
      can(admin, { resource: "datasets", action: "update", params: { research: ownedResearch("draft") } }).can,
    ).toBe(true);
  });

  test("admin can update (patch) a dataset with a published parent", () => {
    expect(
      can(admin, { resource: "datasets", action: "update", params: { research: ownedResearch("published") } })
        .can,
    ).toBe(true);
  });

  test("owner can update (patch) a dataset whose published parent they own", () => {
    expect(
      can(owner, { resource: "datasets", action: "update", params: { research: ownedResearch("published") } })
        .can,
    ).toBe(true);
  });

  test("non-owner non-admin cannot update a dataset with a published parent", () => {
    expect(
      can(stranger, {
        resource: "datasets",
        action: "update",
        params: { research: ownedResearch("published") },
      }).can,
    ).toBe(false);
  });

  test("cannot update a dataset whose parent is in review (wrong status)", () => {
    expect(
      can(admin, { resource: "datasets", action: "update", params: { research: ownedResearch("review") } }).can,
    ).toBe(false);
  });

  test("dataset delete still requires a draft parent (unchanged)", () => {
    expect(
      can(admin, { resource: "datasets", action: "delete", params: { research: ownedResearch("published") } })
        .can,
    ).toBe(false);
    expect(
      can(admin, { resource: "datasets", action: "delete", params: { research: ownedResearch("draft") } }).can,
    ).toBe(true);
  });
});
