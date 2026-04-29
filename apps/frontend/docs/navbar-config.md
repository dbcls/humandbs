# Navbar/Footer config tool

Describes `/admin/header-footer` section

This section is for configureing the navbar and Footer's sitemap.

The section has two areas:

- **Navbar config area** - config of the navbar
- **Footer config area** - config of the footer

## Navbar area

Drag&drop documents from the left "Available documents" to the right area in order to assign them to the navbar groups.

**Navbar group** - an item that displayed in the navbar.
It can contain a document, a link and optionally, sub-group items - other documents and/or links.

**Link** - arbitrary URL with tiles in En and Ja, can be created and assigned tin any group. Can point to external resources, or pages that have no documents associated with them.

If the navbar contains sub-group items, these items will be displayed in the drop-down manner in Navbar.

Admin can:

- Toggle visibility of the Navbar group
- Toggle visibility of any of its sub-group items
- Rename group
- Set group priority
  - Priority controls whether the navbar item should be displayed in the Navbar, or go th the Expane menu (`>>` menu).

A group automatically sets itself to disabled, if it has no items assigned to it.

**A document** - a document entry, managed on the `/admin/documents` page. A document has `contentId`

## Footer area

The footer area is similar to the navbar area, except not having priority.
