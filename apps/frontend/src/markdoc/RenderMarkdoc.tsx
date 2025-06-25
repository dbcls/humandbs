import Markdoc from "@markdoc/markdoc";
import React from "react";
import * as components from "./Components";
import { getDocumentWithClassName } from "@/markdoc/nodes/Document";

export function RenderMarkdoc({
  content,
  className,
}: {
  content: any;
  className?: string;
}) {
  return Markdoc.renderers.react(content, React, {
    components: {
      ...components,
      Document: getDocumentWithClassName(className),
    },
  });
}
