// AST-level markdown diff (operates on HAST).
//
// Two-level algorithm:
//   1. BLOCK alignment: LCS over top-level children keyed by tag + text
//      similarity, so a renamed heading or an edited block aligns to its
//      counterpart instead of being shown as delete+insert.
//   2. INLINE diff inside changed blocks:
//        - word-level text diff (char-level for CJK, which has no spaces)
//          woven in as <ins>/<del>
//        - attribute comparison (e.g. callout type info->warning) surfaced as
//          an inline ✎ marker.
//
// Both versions are rendered through the app's real markdown pipeline
// (renderMarkdownToHast), so callouts and everything else are faithful. The
// diffed tree is serialized to HTML and returned as a MarkdownResult, ready for
// the existing <Markdown> renderer (which turns <callout> into <Callout>).

import type { Element, ElementContent, Properties, Root, RootContent, Text } from "hast";
import { toHtml } from "hast-util-to-html";

import { renderMarkdownToHast } from "./markdown";

type HastNode = Root | RootContent;

const el = (tagName: string, properties: Properties, children: ElementContent[] = []): Element => ({
  type: "element",
  tagName,
  properties,
  children,
});

const text = (value: string): Text => ({ type: "text", value });

// ---- text helpers ---------------------------------------------------------
function nodeText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value;
  if ("children" in node && node.children) {
    return node.children.map((c) => nodeText(c as HastNode)).join("");
  }
  return "";
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function blockTag(node: HastNode): string {
  return node.type === "element" ? node.tagName : node.type;
}

// ---- character-bigram similarity (Dice) -----------------------------------
// Works for both space-delimited (en) and space-free scripts (ja/zh).
function bigrams(s: string): Map<string, number> {
  s = normalize(s);
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

function similarity(a: HastNode, b: HastNode): number {
  const sa = normalize(nodeText(a));
  const sb = normalize(nodeText(b));
  if (!sa && !sb) return 1;
  if (sa === sb) return 1;
  const ga = bigrams(sa);
  const gb = bigrams(sb);
  let na = 0;
  let nb = 0;
  let common = 0;
  for (const v of ga.values()) na += v;
  for (const [g, v] of gb) {
    nb += v;
    const c = ga.get(g);
    if (c) common += Math.min(c, v);
  }
  if (na + nb === 0) return 0;
  return (2 * common) / (na + nb);
}

// ---- LCS over arrays with a custom equality -------------------------------
type DiffOp<T> = { type: "match"; a: T; b: T } | { type: "del"; a: T } | { type: "ins"; b: T };

function lcsAlign<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): DiffOp<T>[] {
  const n = a.length;
  const m = b.length;
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = eq(a[i]!, b[j]!)
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ops: DiffOp<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i]!, b[j]!)) {
      ops.push({ type: "match", a: a[i]!, b: b[j]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: "del", a: a[i]! });
      i++;
    } else {
      ops.push({ type: "ins", b: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", a: a[i++]! });
  while (j < m) ops.push({ type: "ins", b: b[j++]! });
  return ops;
}

// ---- inline word/char-level text diff -------------------------------------
// Latin text -> words; CJK -> per-character (no spaces to split on).
function tokenizeWords(s: string): string[] {
  const tokens: string[] = [];
  const re = /(\s+)|([぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ])|([A-Za-z0-9]+|[^\sA-Za-z0-9぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ])/g;
  let m: RegExpExecArray | null = re.exec(s);
  while (m) {
    tokens.push(m[0]);
    m = re.exec(s);
  }
  return tokens;
}

// Word/char-level diff split into the two sides of a side-by-side view:
//   left  = old text with removed runs wrapped in <del>
//   right = new text with added runs wrapped in <ins>
function inlineTextDiffPair(
  oldText: string,
  newText: string,
): { left: ElementContent[]; right: ElementContent[] } {
  const ops = lcsAlign(tokenizeWords(oldText), tokenizeWords(newText), (x, y) => x === y);
  const left: ElementContent[] = [];
  const right: ElementContent[] = [];
  // Buffer consecutive same-type tokens so a multi-char CJK edit becomes one
  // <ins>方法</ins> rather than <ins>方</ins><ins>法</ins>.
  let matchBuf = "";
  let delBuf = "";
  let insBuf = "";
  const flushMatch = () => {
    if (!matchBuf) return;
    left.push(text(matchBuf));
    right.push(text(matchBuf));
    matchBuf = "";
  };
  const flushDel = () => {
    if (!delBuf) return;
    left.push(el("del", {}, [text(delBuf)]));
    delBuf = "";
  };
  const flushIns = () => {
    if (!insBuf) return;
    right.push(el("ins", {}, [text(insBuf)]));
    insBuf = "";
  };
  for (const op of ops) {
    if (op.type === "match") {
      flushDel();
      flushIns();
      matchBuf += op.a;
    } else if (op.type === "del") {
      flushMatch();
      delBuf += op.a;
    } else {
      flushMatch();
      insBuf += op.b;
    }
  }
  flushMatch();
  flushDel();
  flushIns();
  return { left, right };
}

// ---- attribute comparison -------------------------------------------------
const IGNORE_PROPS = new Set(["id"]); // slug ids are derived, not meaningful

interface AttrChange {
  key: string;
  from: unknown;
  to: unknown;
}

function diffAttributes(oldEl?: HastNode, newEl?: HastNode): AttrChange[] {
  const op = (oldEl?.type === "element" ? oldEl.properties : {}) ?? {};
  const np = (newEl?.type === "element" ? newEl.properties : {}) ?? {};
  const changes: AttrChange[] = [];
  const keys = new Set([...Object.keys(op), ...Object.keys(np)]);
  for (const k of keys) {
    if (IGNORE_PROPS.has(k)) continue;
    if (JSON.stringify(op[k]) !== JSON.stringify(np[k])) {
      changes.push({ key: k, from: op[k], to: np[k] });
    }
  }
  return changes;
}

function attrMarker(changes: AttrChange[]): Element | null {
  if (!changes.length) return null;
  const label = changes.map((c) => `${c.key}: ${c.from ?? "—"} → ${c.to ?? "—"}`).join(", ");
  return el("span", { className: ["diff-attr-change"], title: label }, [text(`✎ ${label}`)]);
}

// ---- diff a single matched (changed) block into left/right element clones --
function leadingAnchor(node: Element): Element | undefined {
  return node.children.find(
    (c): c is Element =>
      c.type === "element" &&
      c.tagName === "a" &&
      Array.isArray(c.properties?.className) &&
      (c.properties.className as unknown[]).includes("anchor"),
  );
}

// Container elements whose children are themselves blocks (list items, rows,
// nested quotes). For these we recurse to preserve structure (e.g. <li>) rather
// than flattening to bare text — flattening drops list markers entirely.
const CONTAINER_TAGS = new Set([
  "ol",
  "ul",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "callout",
]);

const isElement = (n: ElementContent): n is Element => n.type === "element";

// Replace a leaf element's text content with the inline word/char diff for the
// requested side, keeping the element's tag, attributes, and any leading anchor.
function inlineDiffSide(
  base: Element,
  oldText: string,
  newText: string,
  side: "left" | "right",
): Element {
  const clone = structuredClone(base);
  if (normalize(oldText) !== normalize(newText)) {
    const pair = inlineTextDiffPair(oldText, newText);
    const inline = side === "left" ? pair.left : pair.right;
    const anchor = leadingAnchor(clone);
    clone.children = anchor ? [anchor, ...inline] : inline;
  }
  return clone;
}

// Diff a matched block into its old (left) / new (right) rendering. Containers
// recurse element-by-element so structure survives; leaf blocks inline-diff text.
function diffBlockPair(oldBlock: Element, newBlock: Element): { left: Element; right: Element } {
  let left: Element;
  let right: Element;

  if (CONTAINER_TAGS.has(oldBlock.tagName) && oldBlock.tagName === newBlock.tagName) {
    const oldKids = oldBlock.children.filter(isElement);
    const newKids = newBlock.children.filter(isElement);
    const ops = lcsAlign(
      oldKids,
      newKids,
      (a, b) => a.tagName === b.tagName && similarity(a, b) >= 0.4,
    );

    const leftKids: ElementContent[] = [];
    const rightKids: ElementContent[] = [];
    for (const op of ops) {
      if (op.type === "ins") {
        rightKids.push(markBlock(op.b, "ins"));
      } else if (op.type === "del") {
        leftKids.push(markBlock(op.a, "del"));
      } else if (normalize(nodeText(op.a)) === normalize(nodeText(op.b))) {
        leftKids.push(structuredClone(op.a));
        rightKids.push(structuredClone(op.b));
      } else {
        // recurse so nested lists / multi-paragraph items keep their structure
        const pair = diffBlockPair(op.a, op.b);
        leftKids.push(pair.left);
        rightKids.push(pair.right);
      }
    }

    left = { ...structuredClone(oldBlock), children: leftKids };
    right = { ...structuredClone(newBlock), children: rightKids };
  } else {
    left = inlineDiffSide(oldBlock, nodeText(oldBlock), nodeText(newBlock), "left");
    right = inlineDiffSide(newBlock, nodeText(oldBlock), nodeText(newBlock), "right");
  }

  const marker = attrMarker(diffAttributes(oldBlock, newBlock));
  if (marker) {
    right.children = [structuredClone(marker), ...right.children];
    right.properties = { ...right.properties, "data-attr-changed": "true" };
  }
  return { left, right };
}

function markBlock(node: Element | Text, kind: "ins" | "del"): ElementContent {
  if (node.type !== "element") {
    return el("span", { "data-diff-node": kind }, [structuredClone(node)]);
  }
  const clone = structuredClone(node);
  clone.properties = { ...clone.properties, "data-diff-node": kind };
  return clone;
}

const isHeading = (n: HastNode) => /^h[1-6]$/.test(blockTag(n));

// A side-by-side row. `left`/`right` are HTML for the old/new column; a missing
// side means that block doesn't exist on that version (pure add / remove).
export interface DiffRow {
  status: "unchanged" | "changed" | "added" | "removed";
  left?: string;
  right?: string;
}

function serialize(node: ElementContent): string {
  return toHtml(node, { allowDangerousCharacters: true });
}

// ---- top-level tree diff -> aligned row pairs -----------------------------
function diffHastRows(oldRoot: Root, newRoot: Root): DiffRow[] {
  const keep = (n: RootContent): n is Element | Text =>
    n.type === "element" || (n.type === "text" && n.value.trim().length > 0);
  const oldBlocks = oldRoot.children.filter(keep);
  const newBlocks = newRoot.children.filter(keep);

  // Same tag AND similar enough to be "the same block edited". Headings are
  // matched on tag alone so a renamed heading aligns instead of replace.
  const eq = (a: Element | Text, b: Element | Text) => {
    if (blockTag(a) !== blockTag(b)) return false;
    if (isHeading(a)) return true;
    if (normalize(nodeText(a)) === normalize(nodeText(b))) return true;
    return similarity(a, b) >= 0.4;
  };

  const ops = lcsAlign(oldBlocks, newBlocks, eq);

  const rows: DiffRow[] = [];
  for (const op of ops) {
    if (op.type === "ins") {
      rows.push({ status: "added", right: serialize(markBlock(op.b, "ins")) });
    } else if (op.type === "del") {
      rows.push({ status: "removed", left: serialize(markBlock(op.a, "del")) });
    } else {
      const attrChanged = diffAttributes(op.a, op.b).length > 0;
      const textChanged = normalize(nodeText(op.a)) !== normalize(nodeText(op.b));
      if (!textChanged && !attrChanged) {
        const html = serialize(structuredClone(op.b));
        rows.push({ status: "unchanged", left: html, right: html });
      } else if (op.a.type === "element" && op.b.type === "element") {
        const { left, right } = diffBlockPair(op.a, op.b);
        rows.push({ status: "changed", left: serialize(left), right: serialize(right) });
      } else {
        // type mismatch (e.g. text<->element) — show as remove + add on each side
        rows.push({
          status: "changed",
          left: serialize(markBlock(op.a, "del")),
          right: serialize(markBlock(op.b, "ins")),
        });
      }
    }
  }
  return rows;
}

/**
 * Diff two markdown documents into aligned side-by-side rows. Each row carries
 * the old (`left`) and new (`right`) HTML for one block, rendered through the
 * app's markdown pipeline (callouts etc. preserved) with inline <ins>/<del>
 * highlights. Consumed by <DiffViewer>, which renders each side via <Markdown>.
 */
export async function renderMarkdownDiffRows(
  oldContent: string,
  newContent: string,
): Promise<DiffRow[]> {
  const [oldRes, newRes] = await Promise.all([
    renderMarkdownToHast(oldContent),
    renderMarkdownToHast(newContent),
  ]);
  return diffHastRows(oldRes.tree, newRes.tree);
}
