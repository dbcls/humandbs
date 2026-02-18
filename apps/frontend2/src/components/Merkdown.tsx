// src/components/Markdown.tsx
import { Link } from "@tanstack/react-router";
import parse, {
  type HTMLReactParserOptions,
  domToReact,
  Element,
} from "html-react-parser";

import { cn } from "@/lib/utils";
import type { MarkdownResult } from "@/utils/markdown";

interface MarkdownProps {
  contentHtml: MarkdownResult;
  className?: string;
}

export function Markdown({ contentHtml, className }: MarkdownProps) {
  const options: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (domNode instanceof Element) {
        // Customize rendering of specific elements
        if (domNode.name === "a") {
          // Handle links
          const href = domNode.attribs.href;
          if (href?.startsWith("/")) {
            // Internal link - use your router's Link component
            return (
              <Link to={href}>{domToReact(domNode.children, options)}</Link>
            );
          }
        }

        if (domNode.name === "img") {
          // Add lazy loading to images
          return (
            <img
              {...domNode.attribs}
              loading="lazy"
              className="rounded-lg shadow-md"
            />
          );
        }
      }
    },
  };

  return (
    <div className={cn("prose", className)}>
      {parse(contentHtml.markup ?? "")}
    </div>
  );
}
