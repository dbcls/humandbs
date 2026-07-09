import { createFileRoute, redirect } from "@tanstack/react-router";
import { createTranslator } from "use-intl";
import { z } from "zod";

import { Card } from "@/components/Card";
import { MarkdownWithTOC } from "@/components/markdown/MarkdownWithTOC";
import { NotFound } from "@/components/NotFound";
import { PreviousVersionsList } from "@/components/PreviousVersionsList";
import type { Messages } from "@/config/i18n";
import {
  $getDocumentBreadcrumbs,
  $getLatestDocumentOrContent,
  $getLatestPublishedDocumentVersion,
  $getPublishedDocumentVersion,
  $getPublishedDocumentVersionList,
} from "@/serverFunctions/documentVersion";
import { renderMarkdown } from "@/utils/markdown";

const humIdPathSchema = z.string().regex(/^hum\d+$/i);

const humIdWithVersion = z
  .string()
  .regex(/^hum\d+-(v\d+)$/i)
  .transform((val) => {
    const [humId, version] = val.split("-");
    return { humId, version };
  });

// Legacy Joomla URL patterns redirected to canonical シンポータル routes:
//   /hum<NNNN>-vN-release    → /research/:humId/versions  (release info page)
//   /hum<NNNN>-latest        → /research/:humId           (latest research detail)
//   /hum<NNNN>-latest-release → /research/:humId/versions (release info page)
const humVersionReleasePattern = /^(hum\d+)-v\d+-release$/i;
const humLatestPattern = /^(hum\d+)-latest$/i;
const humLatestReleasePattern = /^(hum\d+)-latest-release$/i;

// Legacy Joomla versioned-alias / menu-alias redirects:
//   data-sharing-guidelines[-vN]              → guidelines/data-sharing-guidelines
//   security-guidelines-for-{users,...}[-vN]  → guidelines/security-guidelines-for-{...}
//   guideline-revision[N-]*                   → guidelines
//   policy                                    → nbdc-policy
const legacyAliasRedirects: { pattern: RegExp; splat: string }[] = [
  { pattern: /^data-sharing-guidelines(-v[\d-]+)?$/i, splat: "guidelines/data-sharing-guidelines" },
  {
    pattern: /^security-guidelines-for-users(-v\d+)?$/i,
    splat: "guidelines/security-guidelines-for-users",
  },
  {
    pattern: /^security-guidelines-for-submitters(-v\d+)?$/i,
    splat: "guidelines/security-guidelines-for-submitters",
  },
  {
    pattern: /^security-guidelines-for-dbcenters(-v[\d-]+)?$/i,
    splat: "guidelines/security-guidelines-for-dbcenters",
  },
  { pattern: /^guideline-revision[\d-]*$/i, splat: "guidelines" },
  { pattern: /^policy$/i, splat: "nbdc-policy" },
];

// Matches "<docId>/version/<N>" where N is a positive integer
const revisionVersionPattern = /^(.+)\/version\/(\d+)$/;
// Matches "<docId>/version"
const revisionListPattern = /^(.+)\/version/;

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/$")({
  component: RouteComponent,
  notFoundComponent: () => <NotFound />,
  params: z.object({
    _splat: z.string(),
  }),
  loader: async ({ params, context }) => {
    /* === Matching humIds === */
    const humVerReleaseMatch = humVersionReleasePattern.exec(params._splat);

    if (humVerReleaseMatch) {
      throw redirect({
        to: "/{-$lang}/research/$humId/versions",
        params: {
          lang: context.lang,
          humId: humVerReleaseMatch[1].toLowerCase(),
        },
      });
    }

    const parsedHumIdWithVer = humIdWithVersion.safeParse(params._splat);

    if (parsedHumIdWithVer.success) {
      throw redirect({
        to: "/{-$lang}/research/$humId/$version",
        params: {
          lang: context.lang,
          humId: parsedHumIdWithVer.data.humId,
          version: parsedHumIdWithVer.data.version,
        },
      });
    }

    const humLatestReleaseMatch = humLatestReleasePattern.exec(params._splat);

    if (humLatestReleaseMatch) {
      throw redirect({
        to: "/{-$lang}/research/$humId/versions",
        params: {
          lang: context.lang,
          humId: humLatestReleaseMatch[1].toLowerCase(),
        },
      });
    }

    const humLatestMatch = humLatestPattern.exec(params._splat);

    if (humLatestMatch) {
      throw redirect({
        to: "/{-$lang}/research/$humId",
        params: {
          lang: context.lang,
          humId: humLatestMatch[1].toLowerCase(),
        },
      });
    }

    const parsedHumId = humIdPathSchema.safeParse(params._splat);

    if (parsedHumId.success) {
      throw redirect({
        to: "/{-$lang}/research/$humId",
        params: {
          lang: context.lang,
          humId: parsedHumId.data,
        },
      });
    }

    /* === Legacy Joomla news index === */
    if (params._splat === "all-news") {
      throw redirect({
        to: "/{-$lang}/news",
        params: {
          lang: context.lang,
        },
      });
    }

    /* === Legacy Joomla versioned-alias / menu-alias === */
    for (const { pattern, splat } of legacyAliasRedirects) {
      if (pattern.test(params._splat)) {
        throw redirect({
          to: "/{-$lang}/$",
          params: {
            lang: context.lang,
            _splat: splat,
          },
        });
      }
    }

    /** === Matching documents/content items === */

    const t = createTranslator({
      locale: context.lang,
      messages: context.messages as Messages,
      namespace: "common",
    });

    const revisionVersionMatch = revisionVersionPattern.exec(params._splat);

    if (revisionVersionMatch) {
      const docId = revisionVersionMatch[1];
      const versionNumber = Number(revisionVersionMatch[2]);
      if (!Number.isInteger(versionNumber) || versionNumber < 1) {
        throw new Error("Invalid version number");
      }
      const [data, docCrumbs] = await Promise.all([
        $getPublishedDocumentVersion({
          data: { contentId: docId, locale: context.lang, versionNumber },
        }),
        $getDocumentBreadcrumbs({
          data: { contentId: docId, locale: context.lang },
        }),
      ]);

      const contentHtml = await renderMarkdown(data?.content ?? "");

      return {
        kind: "revision" as const,
        contentHtml,
        title: data?.title,
        crumbs: [
          ...docCrumbs,
          { label: t("versions"), href: `/${docId}/version` },
          {
            label: t("version", { n: versionNumber }),
            href: `/${docId}/version/${versionNumber}`,
          },
        ],
        hideTOC: false,
        previousVersions: undefined,
        revisionsBasePath: undefined,
      };
    }

    const revisionListMatch = revisionListPattern.exec(params._splat);
    if (revisionListMatch) {
      const docId = revisionListMatch[1];
      const [versions, docCrumbs] = await Promise.all([
        $getPublishedDocumentVersionList({
          data: { contentId: docId, locale: context.lang },
        }),
        $getDocumentBreadcrumbs({
          data: { contentId: docId, locale: context.lang },
        }),
      ]);
      if (!versions.length) throw new Error("No versions found");
      return {
        kind: "revisionList" as const,
        contentHtml: null,
        title: null,
        crumbs: [...docCrumbs, { label: t("versions"), href: `/${docId}/version` }],
        hideTOC: false,
        previousVersions: versions,
        revisionsBasePath: docId,
      };
    }

    // Try document first, then fall through to content item
    const docData = await $getLatestPublishedDocumentVersion({
      data: { contentId: params._splat, locale: context.lang },
    }).catch(() => undefined);

    if (docData) {
      const [contentHtml, versions, crumbs] = await Promise.all([
        renderMarkdown(docData.content ?? ""),
        $getPublishedDocumentVersionList({
          data: { contentId: params._splat, locale: context.lang },
        }),
        $getDocumentBreadcrumbs({
          data: { contentId: params._splat, locale: context.lang },
        }),
      ]);

      const showRevisions = !(docData.hideRevisions ?? true);
      return {
        kind: "page" as const,
        contentHtml,
        title: docData.title,
        crumbs,
        hideTOC: docData.hideTOC ?? true,
        previousVersions: showRevisions && versions.length ? versions : undefined,
        revisionsBasePath: showRevisions && versions.length ? params._splat : undefined,
      };
    }

    const contentData = await $getLatestDocumentOrContent({
      data: { id: params._splat, lang: context.lang },
    });

    const contentHtml = await renderMarkdown(contentData.content ?? "");

    return {
      kind: "page" as const,
      contentHtml,
      title: contentData.title,
      crumb: contentData.title,
      hideTOC: contentData.hideTOC ?? true,
      previousVersions: undefined,
      revisionsBasePath: undefined,
    };
  },
  head: ({ loaderData }) => {
    return {
      meta: [{ title: `HumanDBs - ${loaderData?.title}` }],
    };
  },
  errorComponent: ({ error }) => (
    <div>
      <h3>Error:</h3>
      {error.message}
    </div>
  ),
});

function RouteComponent() {
  const { kind, contentHtml, title, hideTOC, previousVersions, revisionsBasePath } =
    Route.useLoaderData();

  if (kind === "revisionList") {
    return (
      <Card
        className="min-h-full w-full min-w-0 py-6"
        containerClassName="main-content mt-8 min-w-0"
      >
        <PreviousVersionsList versions={previousVersions} revisionsBasePath={revisionsBasePath} />
      </Card>
    );
  }

  return (
    <MarkdownWithTOC
      title={title}
      markdownResult={contentHtml}
      hideTOC={hideTOC}
      previousVersions={previousVersions}
      revisionsBasePath={revisionsBasePath}
    />
  );
}
