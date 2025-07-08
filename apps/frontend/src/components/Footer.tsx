import DBCLSLogo from "@/assets/DBCLS_Logo.png";
import { useTranslations } from "use-intl";

export function Footer() {
  const t = useTranslations("Footer");

  return (
    <footer className="mt-8 flex justify-between bg-white p-6 text-sm">
      <nav>
        <h3 className="text-secondary font-semibold">{t("sitemap")}</h3>
        <div className="mt-4 flex gap-8">
          <ul className="flex flex-col gap-2">
            <li>{t("home")}</li>
            <li>{t("process-data")}</li>
            <li>{t("guideline-violation")}</li>
          </ul>

          <ul className="flex flex-col gap-2">
            <li>{t("guideline")}</li>

            <li>{t("off-premise-server")}</li>

            <li>{t("FAQ")}</li>
          </ul>

          <ul className="flex flex-col gap-2">
            <li>{t("data-submission")}</li>

            <li>{t("data-privision-committee")}</li>

            <li>{t("contact")}</li>
          </ul>

          <ul className="flex flex-col gap-2">
            <li>{t("data-usage")}</li>

            <li>{t("achievements")}</li>

            <li>{t("supported-browsers")}</li>
          </ul>
        </div>
      </nav>

      <div>
        <img src={DBCLSLogo} alt=" DBCLS Logo" className="w-32" />
      </div>
    </footer>
  );
}
