# HumanDB frontend app

This is HumanDB "frontend" app.

## Tech stack

- Meta framework: Tanskack Start, full-stack.
- Styling: TailwindCSS v.4
- Caching and querying: TanstackQuery
- DB: PostgreSQL
- ORM: DrizzleORM
- Localization: use-intl
- Auth: better-auth
- Markdown rendering: markdoc
- React component framework: shadcn

## Structure

- DB schema definitions: `src/db/schema/*`
- Server functions: `src/serverFunctions/*`
  - TS query oprions are defined in the same file as the server function it uses as queryFn.
  - Every server function name should start with `$`
- Tanstack Start routes definitions: `src/routes/**`
- Permission management is RBAC, the roles & permissions are defined here: `src/lib/permissions.ts`
- i18n localizations are defined in `localization/messages/*.json` files.

## App structure

App is largely divided in two parts: the Public part, that is visible to all visitors, and the Private part, which is visible only to logged-in users. Private part will have multiple sub-parts, accessible to specific user roles. But currently there is only one part of the Private part - the CMS, and the user roles currently are:

- admin - admin user that can do any actions with CMS
- editor - user can make most of the actions in the CMS
- user - user with this role cannot access the CMS.

### Private part

#### CMS

The CMS-related routes are in `src/routes/_authed/**`.

CMS consists of main tabs, each corresponds to main entity type being edited:

- Document - management of documents that are rendered to visitors. Documents have versions and translations to support multilingual content.
- News - management of news that are rendered to visitors. News has translations as well.
- User - management of users and their roles in the system.
- Alert - management of alert messages that are shown above all content, right under the Navbar, for all users.
