import Markdoc, { RenderableTreeNode } from "@markdoc/markdoc";
import { CatchBoundary } from "@tanstack/react-router";
import React from "react";

import { getDocumentWithClassName } from "@/markdoc/nodes/Document";

import * as components from "./Components";

export function RenderMarkdoc({
  content,
  className,
}: {
  content: string | RenderableTreeNode;
  className?: string;
}) {
  return (
    <CatchBoundary getResetKey={() => "reset"}>
      {Markdoc.renderers.react(
        typeof content === "string" ? JSON.parse(content) : content,
        React,
        {
          components: {
            ...components,
            Document: getDocumentWithClassName(className),
          },
        }
      )}
    </CatchBoundary>
  );
}
