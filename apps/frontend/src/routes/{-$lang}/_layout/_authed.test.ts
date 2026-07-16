import { describe, expect, test } from "bun:test";

import { isRedirect } from "@tanstack/react-router";

import { Route } from "./_authed";
import { Route as AdminRoute } from "./_authed/admin/route";

describe("authenticated layout", () => {
  test("is server-rendered so it can redirect before loading admin content", () => {
    expect(Route.options.ssr).not.toBe(false);
    expect(AdminRoute.options.ssr).toBe(false);
  });

  test("uses a document navigation to begin login for unauthenticated users", () => {
    expect(Route.options.beforeLoad).toBeDefined();

    try {
      Route.options.beforeLoad?.({
        context: { user: null, lang: "ja" },
        location: {
          pathname: "/ja/admin/documents",
          search: { page: 2 },
          hash: "#item",
        },
      } as never);
    } catch (error) {
      if (!isRedirect(error)) throw error;

      expect(error.options).toMatchObject({
        to: "/auth/login",
        reloadDocument: true,
        search: { redirect: "/ja/admin/documents?page=2#item" },
      });
      return;
    }

    throw new Error("Expected unauthenticated access to redirect to login");
  });
});
