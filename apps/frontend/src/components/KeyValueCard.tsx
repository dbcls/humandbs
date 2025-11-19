import { Fragment } from "react/jsx-runtime";
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
  keyValues: Record<string, string | string[] | undefined | null>;
}) {
  return (
    <dl className="columns-2">
      {Object.entries(keyValues).map(([key, value], i, arr) => (
        <p className="break-inside-avoid-column" key={key}>
          <KeyValueCard key={key} title={key} value={value} />
          <Separator variant={"solid"} show={i < arr.length - 1 && !!value} />
        </p>
      ))}
    </dl>
  );
}
