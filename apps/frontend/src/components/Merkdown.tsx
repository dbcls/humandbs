// src/components/Markdown.tsx
import { Link } from "@tanstack/react-router";
import parse, {
  type HTMLReactParserOptions,
  domToReact,
  Element,
} from "html-react-parser";

import { Callout } from "@/components/markdown/Callout";
import { cn } from "@/lib/utils";
import type { MarkdownResult } from "@/utils/markdown";

interface MarkdownProps {
  contentHtml: MarkdownResult;
  className?: string;
}

type CalloutType = "info" | "tip" | "error" | "warning";

function getCalloutType(rawType?: string): CalloutType {
  const type = (rawType ?? "info").toLowerCase();
  if (
    type === "info" ||
    type === "tip" ||
    type === "error" ||
    type === "warning"
  ) {
    return type;
  }
  return "info";
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
              <Link to={href}>
                {domToReact(
                  //@ts-ignore
                  domNode.children,
                  options,
                )}
              </Link>
            );
          }
        }

        if (domNode.name === "img") {
          // Add lazy loading to images
          return <img {...domNode.attribs} loading="lazy" />;
        }

        if (domNode.name === "callout") {
          return (
            <Callout
              type={getCalloutType(domNode.attribs.type)}
              title={domNode.attribs.title}
            >
              {domToReact(
                //@ts-ignore
                domNode.children,
                options,
              )}
            </Callout>
          );
        }
      }
    },
  };

  return (
    <div
      className={cn(
        "prose prose-h1:text-secondary prose-h1:font-medium prose-h1:mb-2 text-base prose-headings:[&_a]:no-underline",
        className,
      )}
    >
      {parse(contentHtml.markup ?? "", options)}
    </div>
  );
}
