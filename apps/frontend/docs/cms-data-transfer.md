# CMS Data Transfer

Describes `/{lang}/admin/data-transfer`

This page is for exporting CMS data to an archive and restoring CMS data from that archive.

## Categories

The page supports these categories:

- `Content`
- `Documents`
- `News`
- `Alerts`
- `Assets`
- `Header & Footer`
- `Flowcharts`

## Export

Export is started from the `Download CMS data` dialog.

The exported file format is `.tar.gz`.

The archive contains:

- `manifest.json`
- `categories/content.json`
- `categories/documents.json`
- `categories/news.json`
- `categories/alerts.json`
- `categories/header-footer.json`
- `categories/flowcharts.json`
- `assets/**` when `Assets` is selected

`manifest.json` contains:

- `schemaVersion`
- `archiveFormat`
- `createdAt`
- `createdBy`
- selected `categories`
- per-category `counts`

Only the selected categories are included in the archive.

## Restore

Restore is started by uploading an archive in the `Restore data from archive` section.

Supported input file types:

- `.tar.gz`
- `.tgz`
- `.tar`

The uploaded archive is validated before restore:

- file type
- file size
- `manifest.json` presence
- manifest schema version
- required category payload files
- payload JSON shape
- manifest counts against payload contents

After validation, the page shows:

- archive file name
- archive size
- archive creation time
- schema version
- archive format
- archive author
- included categories
- asset file count

Only categories present in the archive can be selected for restore.

## Restore behavior

Restore replaces the selected categories in the target environment.

Behavior by category:

- `Content`: replaces `content_item` and `content_translation`
- `Documents`: replaces `document` and `document_version`
- `News`: replaces `news_item`, `news_translation`, `news_tag`, and `news_item_tag`
- `Alerts`: replaces `alert` and `alert_translation`
- `Header & Footer`: replaces the active site navigation config and creates one fresh revision row
- `Flowcharts`: replaces flowcharts and creates one fresh revision row per restored flowchart
- `Assets`: replaces the managed asset directory with the archive contents

Restore preserves business IDs from the archive.

Restore does not import historical revision rows for `Header & Footer` or `Flowcharts`.

Restore writes new revision rows for those categories in the target environment.

For user-linked fields such as `authorId` and `updatedBy`, restore uses the restoring admin user where needed so foreign-key inserts succeed in the target environment.

After a successful restore, frontend queries are invalidated so CMS pages reload current data.

## Assets

`Assets` are not stored in Postgres.

They are read from and restored to the directory resolved from:

- development: `./public/<HUMANDBS_FRONTEND_PUBLIC_FILES_DIR>`
- production: `./dist/client/<HUMANDBS_FRONTEND_PUBLIC_FILES_DIR>`

`HUMANDBS_FRONTEND_PUBLIC_FILES_DIR` controls the asset folder name.

If the variable is not set, the default folder name is `public-files`.

Restore stages asset files in a temporary directory first, then swaps that directory into place.

## Size limit

Frontend validation uses a `500 MB` archive limit.

Nginx must allow request bodies at least that large.

The nginx config includes:

```nginx
client_max_body_size 500m;
```

## Files

Main files for this feature:

- `apps/frontend/src/routes/{-$lang}/_layout/_authed/admin/data-transfer.tsx`
- `apps/frontend/src/routes/{-$lang}/_layout/_authed/admin/-components/DataTransferPage.tsx`
- `apps/frontend/src/serverFunctions/cmsDataTransfer.ts`
- `apps/frontend/src/lib/cmsDataTransferArchive.ts`
- `apps/frontend/src/lib/cmsDataTransferArchive.test.ts`
