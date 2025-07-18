# CMS DB

## Document

A document entity. It only has a name, and can have different contents. More like a section

- id
- name - for internal uses. A Document's name.

## Document version

Document version. Has actual document content.

- id
- document_id - reference to the document
- version - version number
- authorId - author
- createdAt
- updatedAt

## Document Version translation

Document version translation

- title
- content - markdown / markdoc text
- locale
- documentVersionId
- createdAt
- updatedAt
- translatedBy

## Newspost

- id
- createdAt
- updatedAt
- authorId

## Newspost translation

A news post for displaying on the news page.

- id
- title - string
- content - markdown / markdoc text
- locale
- translatedBy
- createdAt
- updatedAt

## Asset

A file entity. can be Image, PDF etc.

- id
- title - string
- url
- description
- mimeType - mime type
- createdAt
- updatedAt

* Local files for actually store the files. Using multer.

Upload -> File uploads to a `public` folder with unique name -> url is stored in db.
