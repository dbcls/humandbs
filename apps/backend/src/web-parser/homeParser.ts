import { JSDOM } from "jsdom"

export const parseHumIds = (html: string): string[] => {
  const dom = new JSDOM(html)
  const document = dom.window.document

  const rows = document.querySelectorAll(
    "#list-of-all-researches > tbody > tr",
  )

  const firstColumnLinks = Array.from(rows).map(row => {
    const firstCell = row.querySelector("th")
    if (firstCell === null) {
      throw new Error("Failed to find first cell during parsing home page")
    }
    const anchor = firstCell.querySelector("a")
    if (anchor === null) {
      throw new Error("Failed to find anchor during parsing home page")
    }
    return anchor.href
  })

  // like: https://humandbs.dbcls.jp/hum0001-v1
  const humIds = firstColumnLinks.map(link => {
    const match = link.match(/https:\/\/humandbs\.dbcls\.jp\/(hum\d+)-v\d+/)
    if (match === null) {
      throw new Error(`Failed to parse hum id and version from ${link}`)
    }
    return match[1]
  })

  return humIds
}
