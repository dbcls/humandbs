import { useRouteContext } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import DBCLSLogo from "@/assets/DBCLS_Logo.png";
import { Link } from "@/components/Link";

export function Footer() {
  const { siteNavigation } = useRouteContext({ from: "/{-$lang}/_layout" });
  const tFooter = useTranslations("Footer");
  const tNav = useTranslations("Navbar");

  return (
    <footer className="mt-8 flex flex-wrap justify-between gap-6 bg-white p-6 text-sm">
      <nav className="min-w-0 flex-1">
        <h3 className="text-secondary font-semibold">{tFooter("sitemap")}</h3>
        <div className="mt-4 flex flex-wrap gap-8">
          {siteNavigation.footer.map((group) => (
            <section key={group.id} className="min-w-40 max-w-96">
              <h4 className="text-secondary font-semibold uppercase">
                {tFooter(group.labelKey)}
              </h4>
              <ul className="mt-3 flex flex-col gap-2">
                {group.items.map((item) => (
                  <li key={item.id} className="min-w-0">
                    <Link
                      {...item.linkOptions}
                      className="text-foreground text-xs block max-w-full whitespace-normal break-words no-underline hover:underline"
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

      <div className="shrink-0">
        <img src={DBCLSLogo} alt=" DBCLS Logo" className="w-32" />
      </div>
    </footer>
  );
}
