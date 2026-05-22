import { useRouteContext } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import DBCLSLogo from "@/assets/DBCLS_Logo.png";
import { Link } from "@/components/Link";
import { asLinkProps } from "@/config/site-navigation";

export function Footer() {
  const { siteNavigation } = useRouteContext({ from: "/{-$lang}/_layout" });
  const tFooter = useTranslations("Footer");

  return (
    <footer className="mt-2 flex flex-wrap justify-between gap-6 bg-white p-6 text-sm">
      <nav className="min-w-0 flex-1">
        <h3 className="font-semibold text-secondary">{tFooter("sitemap")}</h3>
        <div className="mt-4 columns-1 gap-8 pb-12 sm:columns-2 md:columns-3 lg:columns-4">
          {siteNavigation.footer.map((group) => (
            <section key={group.id} className="mb-12 break-inside-avoid">
              <h4 className="text-neutral-400 text-xs uppercase">{group.label}</h4>
              <ul className="mt-3 flex flex-col gap-2">
                {group.items.map((item) => (
                  <li key={item.id} className="min-w-0">
                    <Link
                      {...asLinkProps(item.linkOptions)}
                      className="break-words text-foreground text-xs no-underline hover:text-secondary hover:underline"
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
