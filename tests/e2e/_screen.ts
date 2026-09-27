import type { Page } from "@playwright/test"

/**
 * Opens a screen and waits until its scripts have taken it over.
 *
 * **A press before that is a press on the server's HTML**, which follows links
 * but runs nothing a screen does on its own — the cart kept in the browser, the
 * highlight of an element, the record of which screen another was opened from.
 */
export async function openScreen(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState("networkidle")
}
