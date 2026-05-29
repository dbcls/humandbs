import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import type { BundledLanguage, BundledTheme } from "shiki";
import { codeToHtml } from "shiki";

import { useRef, useState } from "react";

import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { cn } from "@/lib/utils";

import { SkeletonLoading } from "./Skeleton";
import { Button } from "./ui/button";

export function CodeSnippet({
  lang,
  code,
  theme = "ayu-light",
  className,
}: {
  lang: BundledLanguage;
  code: string;
  theme?: BundledTheme;
  className?: string;
}) {
  const { data, isPending } = useQuery({
    queryKey: ["codeSnippet", lang, code, theme],
    queryFn: async () => {
      const result = await codeToHtml(code, { lang, theme });
      return result;
    },
  });
  const [, copy] = useCopyToClipboard();

  const timerRef = useRef<Timer | null>(null);

  const [copyLabel, setCopyLabel] = useState("Copy");

  function handleClickCopy() {
    copy(code);
    setCopyLabel("Copied!");
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setCopyLabel("Copy");
      timerRef.current = null;
    }, 2000);
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
        <span>{copyLabel}</span>
      </Button>
      <div className="max-h-96 overflow-auto p-2">
        {isPending || !data ? (
          <SkeletonLoading />
        ) : (
          <div dangerouslySetInnerHTML={{ __html: data }}></div>
        )}
      </div>
    </div>
  );
}
