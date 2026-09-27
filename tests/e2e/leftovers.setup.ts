import { test } from "@playwright/test"

import { SIGNED_IN } from "../../playwright.config"
import {
  deleteLeftoverFiles,
  deleteLeftoverSiteContent,
  discardLeftoverDrafts,
  discardLeftoverInvitations,
} from "./_admin"

/**
 * What a previous run made and did not take out, taken out before the
 * signed-in scenarios begin.
 *
 * **A scenario that fails half-way never reaches its own clean-up**, and what
 * it made would pile up run after run on an instance people also use.
 */
test("前回の e2e が作って残したものを消す", async ({ page }) => {
  test.skip(SIGNED_IN === "", "HUMANDBS_E2E_SESSION が無い (npm run e2e:session)")
  await discardLeftoverDrafts(page)
  await discardLeftoverInvitations(page)
  await deleteLeftoverFiles(page)
  await deleteLeftoverSiteContent(page)
})
