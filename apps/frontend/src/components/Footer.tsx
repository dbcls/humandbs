import { useLocale, useTranslations } from "use-intl";

import DBCLSLogo from "@/assets/DBCLS_Logo.png";
import { Link } from "@/components/Link";
import { getFooterSitemapGroups } from "@/config/site-navigation";

const footerGroupLabels = {
  overview: "group-overview",
  guidelines: "group-guidelines",
  submission: "group-submission",
  usage: "group-usage",
  policy: "group-policy",
} as const;

export function Footer() {
  const lang = useLocale();
  const tFooter = useTranslations("Footer");
  const tNav = useTranslations("Navbar");
  const sitemapGroups = getFooterSitemapGroups(lang);

  return (
    <footer className="mt-8 flex justify-between bg-white p-6 text-sm">
      <nav>
        <h3 className="text-secondary font-semibold">{tFooter("sitemap")}</h3>
        <div className="mt-4 flex gap-8">
          {sitemapGroups.map((group) => (
            <section key={group.id} className="min-w-0">
              <h4 className="text-secondary text-xs font-semibold uppercase">
                {tFooter(footerGroupLabels[group.id])}
              </h4>
              <ul className="mt-3 flex flex-col gap-2">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      {...item.linkOptions}
                      className="text-foreground no-underline hover:underline"
                    >
                      {tNav(item.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </nav>

      <div>
        <img src={DBCLSLogo} alt=" DBCLS Logo" className="w-32" />
      </div>
    </footer>
  );
}
