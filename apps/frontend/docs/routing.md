# Routing

Describes route resolution of the paths.

Tries to match route in the following order:

0. Routes, specified by the filesystem or Tanstack Router (folders in `src/routes`)
1. `/humXXX-vYY` - redirect to /research/humXXX/version/vYY
2. `/humXXX` - redirect to /research/humXXX - latest version
3. `/<documentId>/revision/<N>` - Revision N of [Document](./documents.md) with documentId
4. `/<documentId>/revision` - list of revisions od the document `<documentId>`
5. `/<documentId>` - latest revision of the document `/<documentId>` with list of previous revisions
6. `<contentId>` - [Content item](./content-items.md)
