import { describe, expect, it } from "vitest"

import { fileUrlList, fileUrlListResponse } from "./url-list"

/** The list a tool reads one line at a time (`wget -i`). */

const ORIGIN = "https://humandbs.example"

describe("fileUrlList", () => {
  it("writes the address of each file on its own line, in the order given", () => {
    expect(fileUrlList(ORIGIN, "hum0014", ["b.zip", "a.zip"])).toBe(
      "https://humandbs.example/files/hum0014/b.zip\nhttps://humandbs.example/files/hum0014/a.zip\n",
    )
  })

  it("escapes a name the way the page links it", () => {
    expect(fileUrlList(ORIGIN, "hum0014", ["dac/DAC summary.pdf"]))
      .toBe("https://humandbs.example/files/hum0014/dac/DAC%20summary.pdf\n")
  })

  it("is empty for no files", () => {
    expect(fileUrlList(ORIGIN, "hum0014", [])).toBe("")
  })
})

describe("fileUrlListResponse", () => {
  it("is text, saved under the label it lists", () => {
    const response = fileUrlListResponse("hum0014", "x\n")

    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
    expect(response.headers.get("Content-Disposition")).toBe("attachment; filename*=UTF-8''hum0014-files.txt")
  })
})
