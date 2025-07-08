import Markdoc from "@markdoc/markdoc";
import React from "react";
import * as components from "./components";
import { getDocumentWithClassName } from "@/markdoc/nodes/Document";
import { CatchBoundary } from "@tanstack/react-router";

export function RenderMarkdoc({
  content,
  className,
}: {
  content: any;
  className?: string;
}) {
  return (
    <CatchBoundary getResetKey={() => "reset"}>
      {Markdoc.renderers.react(content, React, {
        components: {
          ...components,
          Document: getDocumentWithClassName(className),
        },
      })}
    </CatchBoundary>
  );
}
