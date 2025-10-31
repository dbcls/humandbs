import { Locale, Messages } from "@/config/i18n-config";
import { LinkOptions } from "@tanstack/react-router";
type NavLinkId = keyof Messages["Navbar"];

// First let's define our types
type BaseNavItem = {
  id: NavLinkId;
  linkOptions: LinkOptions;
};

type NavItemWithChildren = BaseNavItem & {
  children?: BaseNavItem[];
};

// const l = linkOptions({ to: "/{-$lang}/guidelines/$slug", params: { lang: "en", slug: "guidelines" } });

type NavConfig = NavItemWithChildren[];

export const getNavConfig = (lang: Locale): NavConfig => {
  return [
    {
      id: "data-submission",
      linkOptions: { to: "/{-$lang}/data-submission", params: { lang } },
      children: [
        {
          id: "application",
          linkOptions: {
            to: "/{-$lang}/data-submission/application",
            params: {
              lang,
            },
          },
        },
      ],
    },
    {
      id: "guidelines",
      linkOptions: { to: "/{-$lang}/guidelines", params: { lang } },
      children: [
        {
          id: "data-sharing-guidelines",
          linkOptions: {
            to: "/{-$lang}/guidelines/$slug",
            params: {
              lang,
              slug: "data-sharing-guidelines",
            },
          },
        },
        {
          id: "security-guidelines-for-users",
          linkOptions: {
            to: "/{-$lang}/guidelines/$slug",
            params: {
              lang,
              slug: "security-guidelines-for-users",
            },
          },
        },
        {
          id: "security-guidelines-for-submitters",
          linkOptions: {
            to: "/{-$lang}/guidelines/$slug",
            params: {
              lang,
              slug: "security-guidelines-for-submitters",
            },
          },
        },
        {
          id: "security-guidelines-for-dbcenters",
          linkOptions: {
            to: "/{-$lang}/guidelines/$slug",
            params: {
              lang,
              slug: "security-guidelines-for-dbcenters",
            },
          },
        },
      ],
    },
    {
      id: "data-usage",
      linkOptions: {
        to: "/{-$lang}/$contentId",
        params: { lang, contentId: "data-usage" },
      },
      children: [
        {
          id: "research-list",
          linkOptions: {
            to: "/{-$lang}/data-usage/researches",
            params: {
              lang,
            },
          },
        },
      ],
    },
    {
      id: "about-data",
      linkOptions: {
        to: "/{-$lang}/$contentId",
        params: { lang, contentId: "about-data" },
      },
    },
    {
      id: "achievements",
      linkOptions: {
        to: "/{-$lang}/$contentId",
        params: { lang, contentId: "achievements" },
      },
    },
    {
      id: "contact",
      linkOptions: {
        to: "/{-$lang}/$contentId",
        params: { lang, contentId: "contact" },
      },
    },
  ];
};
