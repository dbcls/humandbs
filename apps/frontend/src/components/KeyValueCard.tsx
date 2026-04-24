import { useRouteContext } from "@tanstack/react-router";

import { type Locale } from "@/config/i18n";

import { Separator } from "./Separator";
import { extractStringFromPossiblyMultilingualValue } from "@/utils/i18n";

export function KeyValueCard({
  title,
  value,
  children,
}: {
  title: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  if (!value && !children) return null;
  return (
    <div className="break-inside-avoid">
      <dt className="text-secondary mb-2 text-sm font-normal">{title}</dt>
      {children ? (
        <dd className="pl-4 wrap-break-word">{children}</dd>
      ) : (
        <dd
          dangerouslySetInnerHTML={{ __html: value! }}
          className="pl-4 wrap-break-word"
        />
      )}
    </div>
  );
}

export function ListOfKeyValues({
  keyValues,
}: {
  keyValues: Record<
    string,
    | string
    | string[]
    | Record<Locale, string | { text: string; rawHtml?: string } | null>
    | undefined
    | null
  >;
}) {
  const { lang } = useRouteContext({ strict: false });

  return (
    <dl className="columns-2">
      {Object.entries(keyValues).map(([key, val], i, arr) => {
        const value = extractStringFromPossiblyMultilingualValue(val, lang);
        return (
          <div className="break-inside-avoid-column" key={key}>
            <KeyValueCard title={key} value={value} />
            <Separator variant={"solid"} show={i < arr.length - 1 && !!value} />
          </div>
        );
      })}
    </dl>
  );
}
