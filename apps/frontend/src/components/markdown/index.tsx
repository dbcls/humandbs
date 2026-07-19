// src/components/Markdown.tsx
import { Link } from "@tanstack/react-router";
import type { HTMLReactParserOptions } from "html-react-parser";
import parse, { domToReact, Element } from "html-react-parser";

import { Callout } from "@/components/markdown/Callout";
import { DocButton } from "@/components/markdown/DocButton";
import { cn } from "@/lib/utils";
import type { MarkdownResult } from "@/utils/markdown";

interface MarkdownProps {
  title?: React.ReactNode | string | null;
  contentHtml: MarkdownResult;
  className?: string;
}

type CalloutType = "info" | "tip" | "error" | "warning";

function getCalloutType(rawType?: string): CalloutType {
  const type = (rawType ?? "info").toLowerCase();
  if (type === "info" || type === "tip" || type === "error" || type === "warning") {
    return type;
  }
  return "info";
}

export function Markdown({ contentHtml, className, title }: MarkdownProps) {
  const options: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (domNode instanceof Element) {
        // Customize rendering of specific elements
        if (domNode.name === "a") {
          const href = domNode.attribs.href;

          if (href?.startsWith("/") && !href.startsWith(`/${PUBLIC_FILES_SUBDIR}/`)) {
            if (href.startsWith("/files/")) {
              return (
                <a href={href} target="_self">
                  {domToReact(
                    //@ts-expect-error
                    domNode.children,
                    options,
                  )}
                </a>
              );
            }

            return (
              <Link to={href}>
                {domToReact(
                  //@ts-expect-error
                  domNode.children,
                  options,
                )}
              </Link>
            );
          }
        }

        if (domNode.name === "img") {
          // Add lazy loading to images
          const { class: className, ...rest } = domNode.attribs;
          return <img className={className} {...rest} loading="lazy" alt={rest.alt ?? `image`} />;
        }

        if (domNode.name === "callout") {
          return (
            <Callout type={getCalloutType(domNode.attribs.type)} title={domNode.attribs.title}>
              {domToReact(
                //@ts-expect-error
                domNode.children,
                options,
              )}
            </Callout>
          );
        }

        if (domNode.name === "button") {
          const { href, variant, iconbefore, iconafter } = domNode.attribs;
          // The fence body parses to a wrapping <p>; unwrap it so the label is
          // inline content inside the button's <a> (a block <p> there is invalid
          // HTML and breaks hydration).
          const labelNodes =
            domNode.children.length === 1 &&
            domNode.children[0] instanceof Element &&
            domNode.children[0].name === "p"
              ? domNode.children[0].children
              : domNode.children;
          return (
            <DocButton href={href} variant={variant} iconBefore={iconbefore} iconAfter={iconafter}>
              {domToReact(
                //@ts-expect-error
                labelNodes,
                options,
              )}
            </DocButton>
          );
        }
      }
    },
  };

  return (
    <div className={cn("custom-prose", className)}>
      {typeof title === "string" ? <h1>{title}</h1> : title || null}
      {parse(contentHtml.markup ?? "", options)}
    </div>
  );
}
