import { describe, expect, test } from "bun:test";

import {
  buildFrontmatter,
  parseFrontmatter,
} from "@/routes/{-$lang}/_layout/_authed/admin/-components/MarkdownFileActions";

describe("document Markdown frontmatter", () => {
  test("serializes and parses an escaped short title", () => {
    const source = buildFrontmatter('Long "title"', 'Short "title"', "en") + "# Content\n";

    expect(source).toContain('shortTitle: "Short \\"title\\""');
    expect(parseFrontmatter(source)).toEqual({
      title: 'Long "title"',
      shortTitle: 'Short "title"',
      content: "# Content\n",
    });
  });

  test("keeps an existing short title untouched when uploaded frontmatter omits it", () => {
    expect(parseFrontmatter('---\ntitle: "Long title"\nlang: en\n---\nBody')).toEqual({
      title: "Long title",
      content: "Body",
      shortTitle: undefined,
    });
  });
});
