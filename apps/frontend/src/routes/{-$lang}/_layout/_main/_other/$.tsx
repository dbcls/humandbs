import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { Card } from "@/components/Card";
import { MarkdownWithTOC } from "@/components/MarkdownWithTOC";
import { PreviousVersionsList } from "@/components/PreviousVersionsList";
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

// Matches "<docId>/revision/<N>" where N is a positive integer
const revisionVersionPattern = /^(.+)\/revision\/(\d+)$/;
// Matches "<docId>/revision"
const revisionListPattern = /^(.+)\/revision$/;

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/$")({
  component: RouteComponent,
  params: z.object({
    _splat: z.string(),
  }),
  loader: async ({ params, context }) => {
    /* === Matching humIds === */
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

    /** === Matching documents/content items === */

    const revisionVersionMatch = revisionVersionPattern.exec(params._splat);

    if (revisionVersionMatch) {
      const docId = revisionVersionMatch[1];
      const versionNumber = Number(revisionVersionMatch[2]);
      if (!Number.isInteger(versionNumber) || versionNumber < 1) {
        throw new Error("Invalid revision number");
      }
      const [data, docCrumbs] = await Promise.all([
        $getPublishedDocumentVersion({
          data: { contentId: docId, locale: context.lang, versionNumber },
        }),
        $getDocumentBreadcrumbs({
          data: { contentId: docId, locale: context.lang },
        }),
      ]);
      if (!data) throw new Error("Revision not found");
      const contentHtml = await renderMarkdown(data.content ?? "");

      return {
        kind: "revision" as const,
        contentHtml,
        title: data.title,
        crumbs: [
          ...docCrumbs,
          { label: "Revisions", href: `/${docId}/revision` },
          {
            label: String(versionNumber),
            href: `/${docId}/revision/${versionNumber}`,
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
      if (!versions.length) throw new Error("No revisions found");
      return {
        kind: "revisionList" as const,
        contentHtml: null,
        title: null,
        crumbs: [...docCrumbs, { label: "Revisions", href: `/${docId}/revision` }],
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

      return {
        kind: "page" as const,
        contentHtml,
        title: docData.title,
        crumbs,
        hideTOC: docData.hideTOC ?? true,
        previousVersions: versions.length ? versions : undefined,
        revisionsBasePath: versions.length ? params._splat : undefined,
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
  errorComponent: ({ error }) => (
    <div>
      <h3>Page not found</h3>
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
      markdownResult={contentHtml!}
      hideTOC={hideTOC}
      previousVersions={previousVersions}
      revisionsBasePath={revisionsBasePath}
    />
  );
}
