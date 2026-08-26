# Translations dictionaries

- Can have nested values, i.e. `Dataset.moldata-keys`.

Key naming conventions:

- If the key should be translated automatically, by just passing whatever value comes from the API, use notation exactly as in the API spec (i.e.: `typeOfData`, `Materials and Participants`, `Controlled-access (Type I)` etc...).
- If the key is purely semantic, frontent-related - use kebab-case (i.e. `moldata-keys`, ``)
- If the intended usage of the key is to render the nested schema form (like in admin/researches Research metadata form, Dataset form etc.) - use following nested structure:

  ```json
  "fields": {
    "<object field key>": {
      "label": "<label of the object field itself>",
      "fields": {
        "nestedKey1": {
          "label": "<label of the nested key 1>",
          "fields": {
            "subNestedKey1": { "label": "<label of the sub nested key 1>" }
          }
        },
        "nestedKey2": {
          "label": "<label of the nested key 2>"
        }
      }
    }
  }
  ```

  - usually, the key names are the names as they come from the API, in camelCase.

- Use direct strings for independent interface messages such as button labels, dialog text, and paragraphs.
- Keep all research field labels in the shared `Research.fields` tree; both public and admin research views use it.
- Store search filters below `Filters.facets`. Each facet has a `label`, and fixed API values belong in an `options` object. Field names such as `label`, `fields`, and `options` are safe when they are keys within a field's `fields` object.
