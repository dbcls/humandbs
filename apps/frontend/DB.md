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
- title - string
- content - markdown / markdoc text
- created_at
- author_id

## Newspost

A news post for displaying on the news page.

- id
- title - string
- content - markdown / markdoc text
- author_id
- created_at

## Asset

A file entity. can be Image, PDF etc.

- id
- title - string
- lang
- url
- alt_text
- type - mime type

* Local files for actually store the files. Using multer.

Upload -> File uploads to a `public` folder with unique name -> url is stored in db.
