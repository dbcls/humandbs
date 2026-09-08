/**
 * The OpenAPI document, built from the endpoint list rather than written beside
 * it.
 *
 * The library turns a schema into JSON Schema and places `$ref`, `required` and
 * the `in` of a parameter correctly; what it cannot know is anything that is not
 * in a schema, so the pieces a linter asks for — servers, security, a licence,
 * an operation id — are filled in here.
 *
 * **Security is declared empty rather than left out.** The API takes no
 * credentials at all, and an empty requirement says so; an absent one only says
 * that nobody wrote it down.
 */

import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type ResponseConfig,
} from "@asteasolutions/zod-to-openapi"

import { API_ENDPOINTS, type ApiEndpoint } from "./endpoints"
import { problemSchema } from "./schema"

/**
 * The version of the contract, not of the deployment. The portal does not
 * promise that an answer's content stays the same — a version can be fixed in
 * place without its number changing — so a version here that moved with every
 * release would be saying something it does not mean.
 */
const API_VERSION = "1.0.0"

const DESCRIPTION = `
The public data of the NBDC Human Database portal, as JSON.

**Two kinds of object.** A *research* is a study, published in numbered versions; a *dataset* is
one body of data belonging to exactly one research. A research answers with the ids of its
datasets rather than with the datasets themselves, because each of them has an address of its own.

**Nothing is authenticated.** Only published objects are ever returned, so there is nothing to
authenticate against. An unpublished object and one that never existed answer alike, and no
endpoint tells them apart.

**Where to start.** \`GET /api/fields\` says what a search may be written against.
\`GET /api/research\` and \`GET /api/dataset\` take that query and answer twenty at a time.
\`.jsonl\` beside either name streams the whole published set instead, one object to a line.

**Reading an answer.** Both languages are always carried and neither falls back on the other:
\`ja\` and \`en\` are what somebody wrote, not what the portal guessed. **A key that is
absent is a value nobody filled in; \`null\` means the value is known not to exist.** An array
is always there, empty if it holds nothing. Prose is plain text — a link written inside a sentence
keeps its words and loses its destination, while the references a machine needs (accessions,
dataset ids, vocabulary, files) are typed fields of their own.

**What is promised.** The addresses, and nothing about what they answer with. A version can be
corrected in place without its number changing, so the same URL does not always give the same
bytes, and there is no way offered of telling that it changed.
`.trim()

/** React Router spells a parameter `:name`; OpenAPI spells it `{name}`. */
export function documentPath(path: string): string {
  return `/${path.replace(/:([A-Za-z0-9_]+)/g, "{$1}")}`
}

const PROBLEM_DESCRIPTIONS: Record<number, string> = {
  404: "No published object answers to that label.",
  422: "A parameter could not be read, or the ordering asked for is not available.",
}

function responsesOf(endpoint: ApiEndpoint): Record<string, ResponseConfig> {
  const responses: Record<string, ResponseConfig> = {
    200: {
      description: endpoint.response.description,
      content: { [endpoint.response.mediaType]: { schema: endpoint.response.schema } },
    },
  }
  for (const status of endpoint.problems) {
    responses[status] = {
      description: PROBLEM_DESCRIPTIONS[status] ?? "Error.",
      content: { "application/problem+json": { schema: problemSchema } },
    }
  }
  return responses
}

export function apiDocument(origin: string): object {
  const registry = new OpenAPIRegistry()

  for (const endpoint of API_ENDPOINTS) {
    registry.registerPath({
      method: "get",
      path: documentPath(endpoint.path),
      operationId: endpoint.operationId,
      tags: [endpoint.tag],
      summary: endpoint.summary,
      description: endpoint.description,
      request: { params: endpoint.params, query: endpoint.query },
      responses: responsesOf(endpoint),
    })
  }

  const generator = new OpenApiGeneratorV31(registry.definitions)
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "NBDC Human Database API",
      version: API_VERSION,
      description: DESCRIPTION,
      license: { name: "Apache-2.0", identifier: "Apache-2.0" },
    },
    servers: [{ url: origin }],
    security: [],
    tags: [
      { name: "research", description: "Research entries and their versions." },
      { name: "dataset", description: "Dataset entries." },
      {
        name: "dblink",
        description: "The correspondence between hum labels and JGA accessions.",
      },
    ],
  })
}
