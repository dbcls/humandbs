/**
 * HTML cleaner for misc pages
 *
 * Cleans article HTML by removing unnecessary attributes and tags
 * while preserving semantic content.
 */
import { JSDOM } from "jsdom"

/** Attributes to remove from all elements */
const ATTRS_TO_REMOVE = [
  "style",
  "class",
  "id",
  "align",
  "valign",
  "bgcolor",
  "border",
  "cellpadding",
  "cellspacing",
  "width",
  "height",
]

/** Attributes to preserve */
const ATTRS_TO_KEEP = new Set([
  "href",
  "src",
  "alt",
  "title",
  "colspan",
  "rowspan",
])

/** Tags to remove entirely (including content) */
const TAGS_TO_REMOVE_WITH_CONTENT = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
])

/** Tags to unwrap (remove tag but keep content) */
const TAGS_TO_UNWRAP = new Set([
  "span",
  "font",
  "center",
])

/**
 * Check if an attribute name is an event handler (onclick, onmouseover, etc.)
 */
const isEventHandler = (attrName: string): boolean => {
  return attrName.startsWith("on")
}

/**
 * Check if an attribute name is a data attribute (data-*)
 */
const isDataAttr = (attrName: string): boolean => {
  return attrName.startsWith("data-")
}

/**
 * Remove unwanted attributes from an element
 */
const cleanAttributes = (el: Element): void => {
  const attrsToRemove: string[] = []

  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()

    if (
      ATTRS_TO_REMOVE.includes(name) ||
      isEventHandler(name) ||
      isDataAttr(name) ||
      !ATTRS_TO_KEEP.has(name)
    ) {
      attrsToRemove.push(attr.name)
    }
  }

  for (const attrName of attrsToRemove) {
    el.removeAttribute(attrName)
  }
}

/**
 * Process a single element recursively
 */
const processElement = (el: Element, doc: Document): void => {
  const tagName = el.tagName.toLowerCase()

  // Remove tags with content
  if (TAGS_TO_REMOVE_WITH_CONTENT.has(tagName)) {
    el.remove()
    return
  }

  // Process children first (bottom-up)
  for (const child of Array.from(el.children)) {
    processElement(child, doc)
  }

  // Unwrap tags (replace with children)
  if (TAGS_TO_UNWRAP.has(tagName)) {
    const parent = el.parentNode
    if (parent) {
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el)
      }
      el.remove()
    }
    return
  }

  // Clean attributes for remaining elements
  cleanAttributes(el)
}

/**
 * Clean article HTML
 *
 * - Removes style, class, id, and other non-semantic attributes
 * - Removes event handlers and data-* attributes
 * - Removes script, style, noscript, iframe tags entirely
 * - Unwraps span, font, center tags (keeps content)
 * - Preserves href, src, alt, title, colspan, rowspan attributes
 */
export const cleanArticleHtml = (html: string): string => {
  if (!html || html.trim() === "") {
    return ""
  }

  const dom = new JSDOM(`<div id="root">${html}</div>`)
  const doc = dom.window.document
  const root = doc.getElementById("root")

  if (!root) {
    return ""
  }

  // Process all child elements
  for (const child of Array.from(root.children)) {
    processElement(child, doc)
  }

  // Get cleaned HTML and normalize whitespace
  let cleaned = root.innerHTML

  // Normalize multiple consecutive whitespace/newlines
  cleaned = cleaned.replace(/\s+/g, " ")

  // Clean up space around tags
  cleaned = cleaned.replace(/>\s+</g, "><")
  cleaned = cleaned.replace(/^\s+|\s+$/g, "")

  // Add newlines after block elements for readability
  cleaned = cleaned.replace(/(<\/(p|div|h[1-6]|ul|ol|li|table|tr|thead|tbody)>)/gi, "$1\n")
  cleaned = cleaned.replace(/(<br\s*\/?>)/gi, "$1\n")

  // Remove trailing whitespace from lines and multiple consecutive newlines
  cleaned = cleaned.split("\n").map(line => line.trim()).filter(line => line !== "").join("\n")

  return cleaned
}

/**
 * Extract plain text from HTML
 *
 * Used for search indexing
 */
export const extractPlainText = (html: string): string => {
  if (!html || html.trim() === "") {
    return ""
  }

  const dom = new JSDOM(`<div id="root">${html}</div>`)
  const doc = dom.window.document
  const root = doc.getElementById("root")

  if (!root) {
    return ""
  }

  // Remove script, style tags first
  for (const tag of Array.from(root.querySelectorAll("script, style, noscript"))) {
    tag.remove()
  }

  // Get text content
  let text = root.textContent ?? ""

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim()

  return text
}
