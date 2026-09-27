import { writeFile } from "node:fs/promises"

import { expect } from "@playwright/test"

import { SIGNED_IN } from "../../playwright.config"
import { deleteFile, E2E, e2eFileName, e2eFiles, test, uploadFiles } from "./_admin"
import { openScreen } from "./_screen"

/**
 * The files of a research's prefix, as a curator uploads and arranges them.
 *
 * **Nothing here is published**: a file lands private, and what is done to it
 * while it is private — a label, a new name, deleting it — is not seen by a
 * reader. The files are named for these scenarios and deleted at the end.
 */
test.describe("P-FILES ファイル", () => {
  test.skip(SIGNED_IN === "", "HUMANDBS_E2E_SESSION が無い (npm run e2e:session)")

  test("S-FILES-01: 非公開のファイルを 1 回の PUT と multipart でアップロードし、ラベルを付け、名前を変え、削除できる", async ({ page }) => {
    // multipart は 64 MiB を超えるファイルで使われる
    test.setTimeout(300_000)
    const small = e2eFileName("small.txt")
    const large = e2eFileName("large.bin")
    await writeFile(test.info().outputPath(small), `${E2E}\n`)
    await writeFile(test.info().outputPath(large), Buffer.alloc(65 * 1024 * 1024))

    await uploadFiles(page, [test.info().outputPath(small), test.info().outputPath(large)])
    for (const name of [small, large]) {
      await expect(page.getByRole("row").filter({ hasText: name }), name).toContainText("未公開")
    }
    await expect(page.getByRole("row").filter({ hasText: large })).toContainText("68.2 MB")

    // ラベル
    const row = page.getByRole("row").filter({ hasText: small })
    await row.getByRole("button", { name: "ラベルの編集" }).click()
    const labelling = page.getByRole("dialog")
    await labelling.getByLabel("ラベル ja").fill(`${E2E} ラベル`)
    await labelling.getByLabel("ラベル en").fill(`${E2E} label`)
    await labelling.getByRole("button", { name: "保存" }).click()
    await expect(row).toContainText(`${E2E} ラベル`)
    await expect(row).toContainText(`${E2E} label`)
    // 保存してもダイアログは開いたまま
    await labelling.getByRole("button", { name: "キャンセル" }).click()
    await expect(labelling).toHaveCount(0)

    // 名前の変更
    const renamed = small.replace("small", "renamed")
    await row.getByRole("button", { name: "ファイル名の編集" }).click()
    const renaming = page.getByRole("dialog")
    await renaming.getByLabel("ファイル名").fill(renamed)
    await renaming.getByRole("button", { name: "編集", exact: true }).click()
    await expect(page.getByRole("row").filter({ hasText: renamed })).toBeVisible()
    await expect(page.getByRole("row").filter({ hasText: small })).toHaveCount(0)
    // ラベルは名前と一緒に移る
    await expect(page.getByRole("row").filter({ hasText: renamed })).toContainText(`${E2E} ラベル`)

    await openScreen(page, await e2eFiles(page))
    await deleteFile(page, renamed)
    await deleteFile(page, large)
  })
})
