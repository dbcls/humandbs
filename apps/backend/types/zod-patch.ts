import { z } from "zod";

// Provide a fallback stub for .openapi() in frontend environments where
// @hono/zod-openapi side-effects might not be registered or tree-shaken.
if (!(z.ZodType.prototype as any).openapi) {
  (z.ZodType.prototype as any).openapi = function (this: any) {
    return this;
  };
}
