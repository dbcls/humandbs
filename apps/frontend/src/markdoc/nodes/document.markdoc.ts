/**
 * Note: we define a custom `document` type here in order to pass the
 * raw Markdoc source text to AST, to be consumed in _app. This is an
 * atypical pattern for Markdoc applications.
 */
import Markdoc from "@markdoc/markdoc";
// import { Document } from "./Document";

export const document = {
  ...Markdoc.nodes.document,
  render: "Document",
  children: ["inline"],
  transform(node, config) {
    return new Markdoc.Tag(
      this.render,
      { source: config.source },
      node.transformChildren(config)
    );
  },
};
