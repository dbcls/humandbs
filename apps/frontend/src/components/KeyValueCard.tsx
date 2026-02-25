import { useRouteContext } from "@tanstack/react-router";

import { i18n, type Locale } from "@/config/i18n";

import { Separator } from "./Separator";

export function KeyValueCard({
  title,
  value,
}: {
  title: string;
  value: React.ReactNode | null | undefined;
}) {
  if (!value) return null;
  return (
    <>
      <dt className="text-secondary mb-2 text-sm font-semibold">{title}</dt>
      <dd dangerouslySetInnerHTML={{ __html: value }} />
    </>
  );
}

export function ListOfKeyValues({
  keyValues,
}: {
  keyValues: Record<
    string,
    | string
    | string[]
    | Record<Locale, { text: string; rawHtml?: string } | null>
    | undefined
    | null
  >;
}) {
  const { lang } = useRouteContext({ strict: false });

  return (
    <dl className="columns-2">
      {Object.entries(keyValues).map(([key, value], i, arr) => {
        const resolved =
          value !== null &&
          value !== undefined &&
          typeof value === "object" &&
          !Array.isArray(value)
            ? value[lang ?? i18n.defaultLocale]?.text
            : value;
        return (
          <div className="break-inside-avoid-column" key={key}>
            <KeyValueCard title={key} value={resolved} />
            <Separator
              variant={"solid"}
              show={i < arr.length - 1 && !!resolved}
            />
          </div>
        );
      })}
    </dl>
  );
}
