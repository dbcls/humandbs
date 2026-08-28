# Documents in CMS

A Document is an entry in CMS db that is a document.

Any Document has:

- `contentId` - the path of the document. If the contentId is "a/b/c", the document can be reached by url `<baseURL>/a/b/c`
- version/revision - documents have versioning. Any document with a given `contentId` would also have path `<contentId>/version` and `<contentId>/version/<N>` where N is the number of version.

**Reserved names**

Admin can create a document with virtually any `contentId`, except:

- those, whose segments contain strings mentioned in [`RESERVED_SEGMENTS`](../src/config/routing.ts),
- `contentId` of existing documents

## ERD

```mermaid
erDiagram
    document {
        uuid id PK
        text name UK "contentId"
        timestamp created_at
        boolean hide_toc
    }

    document_version {
        uuid document_id PK, FK
        int version_number PK
        text locale PK
        enum status PK
        text title "title"
        text shortTitle "short title"
        text content
        text author_id FK
        timestamp created_at
        timestamp updated_at
    }

    user {
        text id PK
    }

    document ||--o{ document_version : has_versions
    user ||--o{ document_version : author
```
