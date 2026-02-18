import { cn } from "@/lib/utils";

export function getDocumentWithClassName(className: string | undefined) {
  return ({ source, children }: { source: any; children: React.ReactNode }) => (
    <article
      className={cn(
        "prose prose-h1:text-secondary prose-h1:font-medium prose-h1:mb-2 text-base",
        className
      )}
    >
      {children}
    </article>
  );
}
