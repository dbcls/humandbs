import { useRouteContext } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import DBCLSLogo from "@/assets/DBCLS_Logo.png";
import { Link } from "@/components/Link";
import { asLinkProps } from "@/config/site-navigation";

export function Footer() {
  const { siteNavigation } = useRouteContext({ from: "/{-$lang}/_layout" });
  const tFooter = useTranslations("Footer");

  return (
    <footer className="mt-8 flex flex-wrap justify-between gap-6 bg-white p-6 text-sm">
      <nav className="min-w-0 flex-1">
        <h3 className="font-semibold">{tFooter("sitemap")}</h3>
        <div className="mt-4 columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-8 pb-12">
          {siteNavigation.footer.map((group) => (
            <section key={group.id} className="break-inside-avoid mb-12">
              <h4 className="font-semibold uppercase">{group.label}</h4>
              <ul className="mt-3 flex flex-col gap-2">
                {group.items.map((item) => (
                  <li key={item.id} className="min-w-0">
                    <Link
                      {...asLinkProps(item.linkOptions)}
                      className="hover:text-secondary-light text-xs break-words no-underline"
                    >
                      {item.label}
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
