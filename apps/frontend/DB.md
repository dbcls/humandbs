# CMS Database ERD

## Document

- id - ID
- title - Title of the document
- contentId - Id of content. "data-usage" etc.
- updated_at - Date and time when the document was last updated
- created_at - Date and time when the document was created
- author_id - ID of the user who created the document
- lang - Language of the document (en/ja)
- version - version / revision

## Image

- id
- title
- lang
- url
- alt_text

## File

- id
- title
- url
- file_type

* Local files for actually store the files.

Upload -> File uploads to a `public` folder with unique name -> url is stored in db.
