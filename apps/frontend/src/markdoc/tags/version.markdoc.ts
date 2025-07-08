import { MarkdocTag } from "./types";

export const version = {
  render: "Version",
  attributes: {
    version: {
      type: String,
      required: false,
    },
    updatedAt: {
      type: String,
      required: false,
    },
  },
  children: ["paragraph"],
  description: "Version tag to the document (right-justified text)",
} satisfies MarkdocTag;
