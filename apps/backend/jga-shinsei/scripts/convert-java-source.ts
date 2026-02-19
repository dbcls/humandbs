/**
 * NbdcComponentKey.java + messages.properties + messages_en.properties を解析し、
 * json-data/component-keys.json を生成する 1 回限りの変換スクリプト。
 *
 * Usage: bun run scripts/convert-java-source.ts
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

interface ComponentKeyEntry {
  multiValue: boolean
  label: { ja: string | null; en: string | null }
}

/**
 * NbdcComponentKey.java の enum 定義を解析し、キー名と multiValue フラグを返す。
 *
 * 各行のフォーマット: `key_name(true|false),` または `key_name (true|false),`
 */
function parseJavaEnum(content: string): Map<string, boolean> {
  const entries = new Map<string, boolean>()
  const regex = /^\s*(\w+)\s*\(\s*(true|false)\s*\)\s*[,;]/gm
  let match
  while ((match = regex.exec(content)) !== null) {
    entries.set(match[1], match[2] === "true")
  }
  return entries
}

/**
 * Java .properties ファイルを解析し、キーと値の Map を返す。
 * `key=value` 形式。キーの前後の空白はトリムする。
 */
function parseProperties(content: string): Map<string, string> {
  const props = new Map<string, string>()
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#")) continue
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1)
    props.set(key, value)
  }
  return props
}

function main(): void {
  const baseDir = path.resolve(import.meta.dir, "..")
  const javaSourceDir = path.join(baseDir, "java-source")
  const outputFile = path.join(baseDir, "json-data", "component-keys.json")

  const javaContent = readFileSync(
    path.join(javaSourceDir, "NbdcComponentKey.java"),
    "utf-8",
  )
  const jaContent = readFileSync(
    path.join(javaSourceDir, "messages.properties"),
    "utf-8",
  )
  const enContent = readFileSync(
    path.join(javaSourceDir, "messages_en.properties"),
    "utf-8",
  )

  const enumEntries = parseJavaEnum(javaContent)
  const jaProps = parseProperties(jaContent)
  const enProps = parseProperties(enContent)

  const result: Record<string, ComponentKeyEntry> = {}
  for (const [key, multiValue] of enumEntries) {
    result[key] = {
      multiValue,
      label: {
        ja: jaProps.get(key) ?? null,
        en: enProps.get(key) ?? null,
      },
    }
  }

  writeFileSync(outputFile, JSON.stringify(result, null, 2) + "\n", "utf-8")
  console.log(
    `Generated ${outputFile} with ${Object.keys(result).length} entries`,
  )
}

if (import.meta.main) {
  main()
}

export { parseJavaEnum, parseProperties }
export type { ComponentKeyEntry }
