import Markdoc, { type Schema } from "@markdoc/markdoc";
import { MarkdocTag } from "../tags/types";

/**
 * Generate an id for a heading to be able to jump to it from an index contents
 */
function generateID(children, attributes) {
  if (attributes.id && typeof attributes.id === "string") {
    return attributes.id;
  }
  return children
    .filter((child) => typeof child === "string")
    .join(" ")
    .replace(/[?]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export const heading: Schema = {
  // children: ["inline"],
  attributes: {
    id: { type: String },
    level: { type: Number, required: true, default: 1 },
  },
  transform(node, config) {
    const attributes = node.transformAttributes(config);
    const children = node.transformChildren(config);

    const id = generateID(children, attributes);

    return new Markdoc.Tag(
      `h${node.attributes["level"]}`,
      { ...attributes, id },
      children
    );
  },
} satisfies MarkdocTag;
