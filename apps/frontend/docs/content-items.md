# Content items in CMS

Content items are "orphan pages" - some arbitrary pages left from the legacy Joomla system.

Almost same as the Document, but without versioning system.

Separated from Documents for clarity.

## ERD

```mermaid
erDiagram
    content_item {
        text id PK
        timestamp created_at
        text published_at
        text author_id FK
        boolean hide_toc
    }

    content_translation {
        text content_id PK, FK
        text locale PK
        enum status PK
        text title
        text content
        timestamp updated_at
    }

    user {
        text id PK
    }

    content_item ||--o{ content_translation : has_translations
    user ||--o{ content_item : author
```
