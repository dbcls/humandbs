import { JSDOM } from "jsdom"

interface ParseResult {
  releases: Release[]
  note: string | null
}

interface Release {
  humVersionId: string
  releaseDate: string // YYYY-MM-DD
  content: string
  releaseNote: string[]
}

interface TableData {
  humVersionId: string
  releaseDate: string // YYYY-MM-DD
  content: string
}

interface ReleaseNote {
  humVersionId: string
  note: string[]
}

export const parseReleasePage = (humVersionId: string, html: string): ParseResult => {
  const dom = new JSDOM(html)
  const articleBody = dom.window.document.querySelector("div.articleBody")
  if (articleBody === null) {
    throw new Error(`Failed to find articleBody in ${humVersionId}`)
  }

  // table
  const table = articleBody.querySelector("table")
  const rows = table?.querySelectorAll("tbody tr")
  const tableData: Record<string, TableData> = {}
  for (const row of rows!) {
    const cells = row.querySelectorAll("td")
    if (cells.length < 3) {
      throw new Error(`Failed to find cells in ${humVersionId}`)
    }
    const humIdWithDot = cells[0].textContent
    const humVersionIdLocal = humIdWithDot?.replace(".", "-") ?? null
    const releaseDate = cells[1].textContent
    const content = cells[2].textContent
    if (!humVersionIdLocal || !releaseDate || !content) {
      throw new Error(`Failed to find humVersionId or releaseDate or content in ${humVersionId}`)
    }
    tableData[humVersionIdLocal] = {
      humVersionId: humVersionIdLocal,
      releaseDate: releaseDate.trim(),
      content: content.trim(),
    }
  }

  const children = Array.from(articleBody.children)
  const releaseNotes: Record<string, ReleaseNote> = {}
  let currentHumVersionId: string | null = null
  const lines: string[] = []
  let note: null | string = null
  for (const element of children) {
    if (element.tagName === "H2") {
      const humIdWithDot = element.textContent?.trim()
      const humVersionIdLocal = humIdWithDot?.replace(".", "-") ?? null
      if (!humVersionIdLocal) {
        throw new Error(`Failed to find humIdWithDot in ${humVersionId}`)
      }
      if (currentHumVersionId !== null) {
        releaseNotes[currentHumVersionId] = {
          humVersionId: currentHumVersionId,
          note: lines.map((line) => line.trim()).filter((line) => line !== ""),
        }
      }
      currentHumVersionId = humVersionIdLocal
    } else if (element.tagName === "P") {
      if (currentHumVersionId === null) {
        continue
      }
      const content = element.textContent?.trim()
      if (content?.startsWith("Note:") || content?.startsWith("Note：")) {
        const noteContent = content.replace("Note:", "").replace("Note：", "").trim()
        if (noteContent) {
          note = noteContent
        }
        continue
      }
      lines.push(content ?? "")
    } else {
      if (element.tagName === "TABLE") {
        continue
      }
      console.log("=== Unknown element ===")
      console.log(element.tagName)
      console.log(element.textContent)
    }
  }
  if (currentHumVersionId !== null) {
    releaseNotes[currentHumVersionId] = {
      humVersionId: currentHumVersionId,
      note: lines.map((line) => line.trim()).filter((line) => line !== ""),
    }
  }

  const releases: Release[] = []
  for (const humVersionId in tableData) {
    const releaseDate = tableData[humVersionId].releaseDate
    const content = tableData[humVersionId].content
    const releaseNote = releaseNotes[humVersionId]?.note ?? []
    releases.push({
      humVersionId,
      releaseDate,
      content,
      releaseNote,
    })
  }
  const parseResult: ParseResult = {
    releases,
    note: note ?? null,
  }

  return parseResult
}
