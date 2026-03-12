/**
 * Tests for error classes and utilities
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import {
  AppError,
  ConflictError,
  ERROR_TITLES,
  ERROR_TYPE_URIS,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  createErrorFromStatus,
  createProblemDetails,
  isAppError,
  toProblemDetails,
} from "@/api/errors"

// === AppError base class ===

describe("AppError", () => {
  it("sets statusCode, code, name, and message", () => {
    const err = new AppError("test", 400, "TEST")

    expect(err.message).toBe("test")
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe("TEST")
    expect(err.name).toBe("AppError")
  })

  it("has stack trace", () => {
    const err = new AppError("test", 500, "TEST")
    expect(err.stack).toBeDefined()
  })

  it("is instance of Error", () => {
    const err = new AppError("test", 400, "TEST")
    expect(err).toBeInstanceOf(Error)
  })
})

// === Subclass tests ===

describe("ValidationError", () => {
  it("defaults", () => {
    const err = new ValidationError("bad input")

    expect(err.statusCode).toBe(400)
    expect(err.code).toBe("VALIDATION_ERROR")
    expect(err.name).toBe("ValidationError")
    expect(err.message).toBe("bad input")
    expect(err).toBeInstanceOf(AppError)
  })

  it("accepts details", () => {
    const details = { field: "email", reason: "invalid" }
    const err = new ValidationError("bad input", details)

    expect(err.details).toEqual(details)
  })
})

describe("UnauthorizedError", () => {
  it("default message", () => {
    const err = new UnauthorizedError()

    expect(err.statusCode).toBe(401)
    expect(err.code).toBe("UNAUTHORIZED")
    expect(err.message).toBe("Authentication required")
  })

  it("custom message", () => {
    const err = new UnauthorizedError("Token expired")
    expect(err.message).toBe("Token expired")
  })
})

describe("ForbiddenError", () => {
  it("default message", () => {
    const err = new ForbiddenError()

    expect(err.statusCode).toBe(403)
    expect(err.code).toBe("FORBIDDEN")
    expect(err.message).toBe("Not authorized")
  })

  it("custom message", () => {
    const err = new ForbiddenError("Admin only")
    expect(err.message).toBe("Admin only")
  })
})

describe("NotFoundError", () => {
  it("basic", () => {
    const err = new NotFoundError("not found")

    expect(err.statusCode).toBe(404)
    expect(err.code).toBe("NOT_FOUND")
  })

  it("with resource info", () => {
    const err = new NotFoundError("not found", "Research", "hum0001")

    expect(err.resourceType).toBe("Research")
    expect(err.resourceId).toBe("hum0001")
  })

  it("forResource factory", () => {
    const err = NotFoundError.forResource("Research", "hum0001")

    expect(err.message).toBe("Research with ID 'hum0001' not found")
    expect(err.resourceType).toBe("Research")
    expect(err.resourceId).toBe("hum0001")
    expect(err).toBeInstanceOf(NotFoundError)
    expect(err).toBeInstanceOf(AppError)
  })
})

describe("ConflictError", () => {
  it("default message", () => {
    const err = new ConflictError()

    expect(err.statusCode).toBe(409)
    expect(err.code).toBe("CONFLICT")
    expect(err.message).toBe("Resource was modified by another request")
  })

  it("custom message with resource info", () => {
    const err = new ConflictError("duplicate", "Dataset", "JGAD000001")

    expect(err.resourceType).toBe("Dataset")
    expect(err.resourceId).toBe("JGAD000001")
  })

  it("forDuplicate factory", () => {
    const err = ConflictError.forDuplicate("Dataset", "JGAD000001")

    expect(err.message).toBe("Dataset with ID 'JGAD000001' already exists")
    expect(err.resourceType).toBe("Dataset")
    expect(err.resourceId).toBe("JGAD000001")
    expect(err).toBeInstanceOf(ConflictError)
  })
})

describe("InternalError", () => {
  it("default message", () => {
    const err = new InternalError()

    expect(err.statusCode).toBe(500)
    expect(err.code).toBe("INTERNAL_ERROR")
    expect(err.message).toBe("An unexpected error occurred")
  })

  it("with cause", () => {
    const cause = new Error("original")
    const err = new InternalError("wrapped", cause)

    expect(err.cause).toBe(cause)
  })
})

// === isAppError ===

describe("isAppError", () => {
  it("AppError instance -> true", () => {
    expect(isAppError(new ValidationError("test"))).toBe(true)
  })

  it("regular Error -> false", () => {
    expect(isAppError(new Error("test"))).toBe(false)
  })

  it("null -> false", () => {
    expect(isAppError(null)).toBe(false)
  })

  it("undefined -> false", () => {
    expect(isAppError(undefined)).toBe(false)
  })

  it("string -> false", () => {
    expect(isAppError("error")).toBe(false)
  })

  it("PBT: all subclass instances -> true", () => {
    const errors = [
      new ValidationError("v"),
      new UnauthorizedError(),
      new ForbiddenError(),
      new NotFoundError("n"),
      new ConflictError(),
      new InternalError(),
    ]
    for (const err of errors) {
      expect(isAppError(err)).toBe(true)
    }
  })
})

// === createErrorFromStatus ===

describe("createErrorFromStatus", () => {
  it.each([
    [400, ValidationError],
    [401, UnauthorizedError],
    [403, ForbiddenError],
    [404, NotFoundError],
    [409, ConflictError],
    [500, InternalError],
  ] as const)("status %d -> correct class", (status, ErrorClass) => {
    const err = createErrorFromStatus(status, "msg")

    expect(err).toBeInstanceOf(ErrorClass)
    expect(err.message).toBe("msg")
  })

  it("unknown status (502) -> InternalError", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    const err = createErrorFromStatus(502 as any, "bad gateway")

    expect(err).toBeInstanceOf(InternalError)
  })
})

// === toProblemDetails ===

describe("toProblemDetails", () => {
  it("maps error code to type URI", () => {
    const err = new ValidationError("bad input")
    const pd = toProblemDetails(err)

    expect(pd.type).toBe(ERROR_TYPE_URIS.VALIDATION_ERROR)
    expect(pd.title).toBe(ERROR_TITLES.VALIDATION_ERROR)
    expect(pd.status).toBe(400)
    expect(pd.detail).toBe("bad input")
    expect(pd.timestamp).toBeDefined()
  })

  it("includes requestId and instance", () => {
    const err = new NotFoundError("not found")
    const pd = toProblemDetails(err, "req-123", "/api/research/hum0001")

    expect(pd.requestId).toBe("req-123")
    expect(pd.instance).toBe("/api/research/hum0001")
  })

  it("unknown code -> type='unknown', title='Error'", () => {
    const err = new AppError("test", 400, "UNKNOWN_CODE")
    const pd = toProblemDetails(err)

    expect(pd.type).toContain("unknown")
    expect(pd.title).toBe("Error")
  })
})

// === createProblemDetails ===

describe("createProblemDetails", () => {
  it("creates ProblemDetails from status code and code", () => {
    const pd = createProblemDetails(404, "NOT_FOUND", "not found", "req-456", "/api/test")

    expect(pd.type).toBe(ERROR_TYPE_URIS.NOT_FOUND)
    expect(pd.title).toBe(ERROR_TITLES.NOT_FOUND)
    expect(pd.status).toBe(404)
    expect(pd.detail).toBe("not found")
    expect(pd.requestId).toBe("req-456")
    expect(pd.instance).toBe("/api/test")
  })

  it("unknown code -> fallback type and title", () => {
    const pd = createProblemDetails(500, "CUSTOM", "custom error")

    expect(pd.type).toContain("unknown")
    expect(pd.title).toBe("Error")
  })
})

// === PBT: subclass statusCode consistency ===

describe("PBT: statusCode consistency", () => {
  it("all subclasses have correct statusCode", () => {
    expect(new ValidationError("v").statusCode).toBe(400)
    expect(new UnauthorizedError().statusCode).toBe(401)
    expect(new ForbiddenError().statusCode).toBe(403)
    expect(new NotFoundError("n").statusCode).toBe(404)
    expect(new ConflictError().statusCode).toBe(409)
    expect(new InternalError().statusCode).toBe(500)
  })

  it("PBT: createErrorFromStatus preserves message", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(400 as const, 401 as const, 403 as const, 404 as const, 409 as const, 500 as const),
        fc.string({ minLength: 1 }),
        (status, msg) => {
          const err = createErrorFromStatus(status, msg)
          return err.message === msg && isAppError(err)
        },
      ),
    )
  })
})
