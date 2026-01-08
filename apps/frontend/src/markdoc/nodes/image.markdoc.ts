import Markdoc, { Schema } from "@markdoc/markdoc";

/**
 * Returns the pathname of the image, based on image name, language and contentId.
 * Use for simpler way to reference an image from the same folder as .md file, for example, in file `/content/en/data-sharing-quidelines/content.md` :
 *
 * ```
 * ## Some markdown
 * ![Image](image.png)
 * ```
 *
 * the `<img>` tag's `src` attribute would be replaced with `/content/en/data-sharing-quidelines/image.png`
 *
 * @example
 * getSrc("image.png", "data-sharing-quidelines", "en"); // `/content/en/data-sharing-quidelines/image.png`
 *
 * @param url - image url
 * @param contentId - contentId "data-sharing-quidelines", "data-usage", etc.
 * @param lang - language code
 * @returns image src
 */
function getSrc(url: string, contentId: string, lang: string) {
  if (url.startsWith("/") || url.startsWith("http")) return url;

  // TODO confusing with ContentItem, but this is just for markdowns that have links to other files
  return `/content/${lang}/${contentId}/${url}`;
}

export const image: Schema = {
  ...Markdoc.nodes.image,

  transform(node, config) {
    const attributes = node.transformAttributes(config);
    const children = node.transformChildren(config);

    const src = getSrc(
      attributes.src,
      config.variables?.slug,
      config.variables?.lang
    );

    return new Markdoc.Tag(`img`, { ...attributes, src }, children);
  },
};
