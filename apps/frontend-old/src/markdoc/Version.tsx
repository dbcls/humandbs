import { useLocale, useTranslations } from "use-intl";

export function Version({
  version,
  updatedAt,
}: {
  version: string;
  updatedAt: string;
}) {
  const t = useTranslations("Markdoc");

  const locale = useLocale();

  const updatedAtDate = new Date(updatedAt).toLocaleDateString([locale]);

  return (
    <div className="not-prose flex justify-end text-right text-sm">
      <div className="w-fit">
        <p>
          {t("version")} {version}
        </p>
        {t("updatedAt")} {updatedAtDate}
      </div>
    </div>
  );
}
