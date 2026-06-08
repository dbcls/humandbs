import { Copy } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import { useTranslations } from "use-intl";

import { useRef, useState } from "react";

import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { cn } from "@/lib/utils";

import { Button } from "./ui/button";

export function CodeSnippet({
  lang,
  code,
  className,
}: {
  lang: "json";
  code: string;
  className?: string;
}) {
  const [, copy] = useCopyToClipboard();

  const tCommon = useTranslations("common");

  const [copied, setCopied] = useState(false);

  const timerRef = useRef<Timer | null>(null);

  function handleClickCopy() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
    copy(code);
  }

  return (
    <div
      className={cn("group relative rounded-md border border-foreground-light text-xs", className)}
    >
      <Button
        variant={"outline"}
        onClick={handleClickCopy}
        size={"slim"}
        aria-label="Copy code"
        className="absolute top-2 right-2 align-middle opacity-0 transition-opacity hover:opacity-70 active:opacity-80 group-hover:opacity-50"
      >
        <Copy className="mr-2 size-5" />
        <span>{copied ? tCommon("copied") : tCommon("copy")}</span>
      </Button>
      <div className="max-h-96 overflow-auto p-2">
        <Highlight theme={themes.vsLight} code={code} language={lang}>
          {({ style, tokens, getLineProps, getTokenProps }) => (
            <pre style={style}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}
