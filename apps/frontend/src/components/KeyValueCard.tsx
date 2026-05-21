import { useRouteContext } from "@tanstack/react-router";

import type { Locale } from "@/config/i18n";
import { extractStringFromPossiblyMultilingualValue } from "@/utils/i18n";

import { Separator } from "./Separator";

export function KeyValueCard({ title, value }: { title: string; value?: React.ReactNode | null }) {
  if (!value) return null;

  return (
    <div className="break-inside-avoid">
      <dt className="mb-2 font-normal text-secondary text-sm">{title}</dt>
      {typeof value === "object" || typeof value === "function" ? (
        <dd className="wrap-break-word pl-4">{value}</dd>
      ) : (
        <dd dangerouslySetInnerHTML={{ __html: value! }} className="wrap-break-word pl-4" />
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
