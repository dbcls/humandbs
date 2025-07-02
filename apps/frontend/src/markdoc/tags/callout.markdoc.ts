import { MarkdocTag } from "./types";

export const callout = {
  render: "Callout",
  description: "Callout component - some text with emphasis",
  attributes: {
    type: {
      type: String,
      default: "info",
      matches: ["info", "erorr", "warning"],
    },
  },
} satisfies MarkdocTag;
