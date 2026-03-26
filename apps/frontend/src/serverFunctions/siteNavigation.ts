import { createServerFn } from "@tanstack/react-start";

import {
  buildSiteNavigation,
  getDefaultSiteNavigationConfig,
} from "@/config/site-navigation";
import { parseSiteNavigationConfig } from "@/config/site-navigation.schema";
import { localeSchema } from "@/config/i18n";

export const $getSiteNavigation = createServerFn({ method: "GET" })
  .inputValidator(localeSchema)
  .handler(async ({ data: lang }) => {
    const fallback = buildSiteNavigation(lang, getDefaultSiteNavigationConfig());

    try {
      const file = Bun.file("./src/config/site-navigation.json");
      const parsed = parseSiteNavigationConfig(await file.json());
      return buildSiteNavigation(lang, parsed);
    } catch (error) {
      console.error("Failed to load site-navigation.json, using fallback.", error);
      return fallback;
    }
  });
