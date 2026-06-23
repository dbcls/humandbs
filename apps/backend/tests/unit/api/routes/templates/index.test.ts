/**
 * Templates router unit tests.
 *
 * Exercises auth gates, param validation, and the success path of:
 *   - GET /templates/research/{jdsApplId}
 *   - GET /templates/dataset/{externalId}
 *
 * The actual mappers (mapDsApplicationToResearchTemplate, mapJgad..., mapDra...)
 * have their own focused tests; here we stub them so we can verify how the
 * router translates inputs (auth header, path param) into mapper calls and
 * mapper outputs / errors back into HTTP responses (200 / 400 / 401 / 403 /
 * 404 / 500).
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

import { NotFoundError } from "@/api/errors"
import type { DsApplicationTransformed } from "@/api/types"

import { adminAuthHeader, buildMockAuthModule, userAuthHeader } from "../../helpers/mock-auth"

void mock.module("@/api/middleware/auth", buildMockAuthModule)

// === DB / mapper mocks ===

const stubDsApplication = {
  jdsId: "J-DS000001-001",
} as unknown as DsApplicationTransformed

const getDsApplicationMock = mock(async (_applIdStr: string): Promise<DsApplicationTransformed> => stubDsApplication)

void mock.module("@/api/db-client/jga-shinsei", () => ({
  getDsApplication: getDsApplicationMock,
  listDsApplications: mock(async () => ({ hits: [], total: 0 })),
  getDuApplication: mock(async () => ({})),
  listDuApplications: mock(async () => ({ hits: [], total: 0 })),
  parseApplIdStr: (s: string) => {
    const m = s.match(/^(J-D[SU]\d+)-(\d{3})$/)
    if (!m) throw new Error(`Invalid applIdStr: ${s}`)
    return { dsDuId: m[1], applVersion: parseInt(m[2], 10) }
  },
}))

const researchTemplateStub = {
  humId: "hum0001",
  title: { ja: "ja", en: "en" },
  relatedAccessions: { jgad: ["JGAD000001"] },
  warnings: [],
}

const mapDsApplicationToResearchTemplateMock = mock(() => researchTemplateStub)

void mock.module("@/api/routes/templates/mapping-research", () => ({
  mapDsApplicationToResearchTemplate: mapDsApplicationToResearchTemplateMock,
}))

const jgadTemplateStub = {
  datasetId: undefined,
  releaseDate: "2024-01-01",
  criteria: "Controlled-access (Type II)" as const,
  typeOfData: { ja: null, en: "JGAD title" },
  experiments: [],
  warnings: [],
}

let jgadResult: typeof jgadTemplateStub | null = jgadTemplateStub
const mapJgadToDatasetTemplateMock = mock(async () => jgadResult)

void mock.module("@/api/routes/templates/mapping-dataset-jgad", () => ({
  mapJgadToDatasetTemplate: mapJgadToDatasetTemplateMock,
}))

const draTemplateStub = {
  datasetId: undefined,
  releaseDate: "2024-01-01",
  criteria: "Unrestricted-access" as const,
  typeOfData: { ja: null, en: "DRA title" },
  experiments: [],
  warnings: [],
}

let draResult: typeof draTemplateStub | null = draTemplateStub
const mapDraSubmissionToDatasetTemplateMock = mock(async () => draResult)

void mock.module("@/api/routes/templates/mapping-dataset-dra", () => ({
  mapDraSubmissionToDatasetTemplate: mapDraSubmissionToDatasetTemplateMock,
}))

const { getTestApp } = await import("../../helpers")

beforeEach(() => {
  getDsApplicationMock.mockClear()
  mapDsApplicationToResearchTemplateMock.mockClear()
  mapJgadToDatasetTemplateMock.mockClear()
  mapDraSubmissionToDatasetTemplateMock.mockClear()
  jgadResult = jgadTemplateStub
  draResult = draTemplateStub
})

describe("api/routes/templates auth gates", () => {
  it.each([
    ["GET /templates/research/{jdsApplId}", "/templates/research/J-DS000001-001"],
    ["GET /templates/dataset/{externalId}", "/templates/dataset/JGAD000001"],
  ])("%s returns 401 without auth", async (_label, path) => {
    const app = getTestApp()
    const res = await app.request(path)
    expect(res.status).toBe(401)
  })

  it.each([
    ["GET /templates/research/{jdsApplId}", "/templates/research/J-DS000001-001"],
    ["GET /templates/dataset/{externalId}", "/templates/dataset/JGAD000001"],
  ])("%s returns 403 for non-admin", async (_label, path) => {
    const app = getTestApp()
    const res = await app.request(path, { headers: userAuthHeader() })
    expect(res.status).toBe(403)
  })

  it("does not invoke the JGA-Shinsei DB when unauthenticated", async () => {
    const app = getTestApp()
    await app.request("/templates/research/J-DS000001-001")
    expect(getDsApplicationMock).not.toHaveBeenCalled()
  })
})

describe("api/routes/templates - GET /templates/research/{jdsApplId}", () => {
  it("returns 200 + payload from the mapper for an admin", async () => {
    const app = getTestApp()
    const res = await app.request("/templates/research/J-DS000001-001", {
      headers: adminAuthHeader(),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: typeof researchTemplateStub }
    expect(body.data.humId).toBe("hum0001")
    expect(body.data.relatedAccessions.jgad).toEqual(["JGAD000001"])
    expect(getDsApplicationMock).toHaveBeenCalledWith("J-DS000001-001")
    expect(mapDsApplicationToResearchTemplateMock).toHaveBeenCalledTimes(1)
  })

  it("rejects master ID without version suffix with 400", async () => {
    const app = getTestApp()
    const res = await app.request("/templates/research/J-DS000001", {
      headers: adminAuthHeader(),
    })
    expect(res.status).toBe(400)
    expect(getDsApplicationMock).not.toHaveBeenCalled()
  })

  it("rejects malformed jdsApplId with 400", async () => {
    const app = getTestApp()
    const res = await app.request("/templates/research/JDS-001", {
      headers: adminAuthHeader(),
    })
    expect(res.status).toBe(400)
    expect(getDsApplicationMock).not.toHaveBeenCalled()
  })

  it("returns 404 when getDsApplication throws NotFoundError", async () => {
    getDsApplicationMock.mockImplementationOnce(async () => {
      throw NotFoundError.forResource("DS Application", "J-DS999999-001")
    })
    const app = getTestApp()
    const res = await app.request("/templates/research/J-DS999999-001", {
      headers: adminAuthHeader(),
    })
    expect(res.status).toBe(404)
  })

  it("returns 500 when getDsApplication throws a generic Error (e.g., DB connection failure)", async () => {
    getDsApplicationMock.mockImplementationOnce(async () => {
      throw new Error("connection refused")
    })
    const app = getTestApp()
    const res = await app.request("/templates/research/J-DS000001-001", {
      headers: adminAuthHeader(),
    })
    expect(res.status).toBe(500)
  })
})

describe("api/routes/templates - GET /templates/dataset/{externalId}", () => {
  it("routes JGAD prefix to the JGAD mapper", async () => {
    const app = getTestApp()
    const res = await app.request("/templates/dataset/JGAD000001", {
      headers: adminAuthHeader(),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: typeof jgadTemplateStub }
    expect(body.data.criteria).toBe("Controlled-access (Type II)")
    expect(mapJgadToDatasetTemplateMock).toHaveBeenCalledTimes(1)
    expect(mapDraSubmissionToDatasetTemplateMock).not.toHaveBeenCalled()
  })

  it("routes DRA prefix to the DRA mapper", async () => {
    const app = getTestApp()
    const res = await app.request("/templates/dataset/DRA000001", {
      headers: adminAuthHeader(),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: typeof draTemplateStub }
    expect(body.data.criteria).toBe("Unrestricted-access")
    expect(mapDraSubmissionToDatasetTemplateMock).toHaveBeenCalledTimes(1)
    expect(mapJgadToDatasetTemplateMock).not.toHaveBeenCalled()
  })

  it.each([
    "/templates/dataset/DRX000001",
    "/templates/dataset/DRP000001",
    "/templates/dataset/DRS000001",
    "/templates/dataset/JGAS000001",
    "/templates/dataset/jgad000001",
    "/templates/dataset/PRJDB1234",
    "/templates/dataset/SAMD00012345",
  ])("rejects %s with 400", async (path) => {
    const app = getTestApp()
    const res = await app.request(path, { headers: adminAuthHeader() })
    expect(res.status).toBe(400)
    expect(mapJgadToDatasetTemplateMock).not.toHaveBeenCalled()
    expect(mapDraSubmissionToDatasetTemplateMock).not.toHaveBeenCalled()
  })

  it("returns 404 when the JGAD mapper resolves null", async () => {
    jgadResult = null
    const app = getTestApp()
    const res = await app.request("/templates/dataset/JGAD999999", {
      headers: adminAuthHeader(),
    })
    expect(res.status).toBe(404)
  })

  it("returns 404 when the DRA mapper resolves null", async () => {
    draResult = null
    const app = getTestApp()
    const res = await app.request("/templates/dataset/DRA999999", {
      headers: adminAuthHeader(),
    })
    expect(res.status).toBe(404)
  })

  it("returns 500 when the DRA mapper throws (DDBJ 5xx / network error)", async () => {
    mapDraSubmissionToDatasetTemplateMock.mockImplementationOnce(async () => {
      throw new Error("DDBJ Search API returned 503")
    })
    const app = getTestApp()
    const res = await app.request("/templates/dataset/DRA000001", {
      headers: adminAuthHeader(),
    })
    expect(res.status).toBe(500)
  })
})
