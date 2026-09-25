/**
 * A file list as text: the address of every file, one to a line, for a tool
 * that fetches each line it reads (`wget -i`). A research's files run to
 * hundreds of gigabytes, so the list is what is handed over rather than the
 * files in one archive.
 *
 * **Each line is one address and nothing else.** The names are escaped segment
 * by segment the way the page links them (`filePath`), so a space or a tab in
 * a name does not break a line in two.
 */

import { filePath } from "~/public/urls"

import { attachmentDisposition } from "./prefix"

export function fileUrlList(origin: string, humLabel: string, names: readonly string[]): string {
  return names.map((name) => `${origin}${filePath(humLabel, name)}\n`).join("")
}

/** The list as a file, saved under the label it lists (`hum0014-files.txt`). */
export function fileUrlListResponse(label: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": attachmentDisposition(`${label}-files.txt`),
    },
  })
}
