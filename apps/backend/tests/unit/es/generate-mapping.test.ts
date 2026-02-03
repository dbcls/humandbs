import { describe, expect, it } from "bun:test"

import { f, generateMapping } from "@/es/generate-mapping"

describe("es/generate-mapping.ts", () => {
  // ===========================================================================
  // Field helpers (f.*)
  // ===========================================================================
  describe("f.keyword", () => {
    it("should return keyword field definition", () => {
      const def = f.keyword()
      expect(def).toEqual({ type: "keyword" })
    })
  })

  describe("f.text", () => {
    it("should return text field definition", () => {
      const def = f.text()
      expect(def).toEqual({ type: "text" })
    })
  })

  describe("f.textKw", () => {
    it("should return text_keyword field definition", () => {
      const def = f.textKw()
      expect(def).toEqual({ type: "text_keyword" })
    })
  })

  describe("f.date", () => {
    it("should return date field definition without format", () => {
      const def = f.date()
      expect(def).toEqual({ type: "date", format: undefined })
    })

    it("should return date field definition with custom format", () => {
      const def = f.date("yyyy-MM-dd")
      expect(def).toEqual({ type: "date", format: "yyyy-MM-dd" })
    })
  })

  describe("f.integer", () => {
    it("should return integer field definition", () => {
      const def = f.integer()
      expect(def).toEqual({ type: "integer" })
    })
  })

  describe("f.long", () => {
    it("should return long field definition", () => {
      const def = f.long()
      expect(def).toEqual({ type: "long" })
    })
  })

  describe("f.float", () => {
    it("should return float field definition", () => {
      const def = f.float()
      expect(def).toEqual({ type: "float" })
    })
  })

  describe("f.boolean", () => {
    it("should return boolean field definition", () => {
      const def = f.boolean()
      expect(def).toEqual({ type: "boolean" })
    })
  })

  describe("f.flattened", () => {
    it("should return flattened field definition", () => {
      const def = f.flattened()
      expect(def).toEqual({ type: "flattened" })
    })
  })

  describe("f.noindex", () => {
    it("should return noindex field definition", () => {
      const def = f.noindex()
      expect(def).toEqual({ type: "noindex" })
    })
  })

  describe("f.disabled", () => {
    it("should return disabled field definition", () => {
      const def = f.disabled()
      expect(def).toEqual({ type: "disabled" })
    })
  })

  describe("f.nested", () => {
    it("should return nested field definition with schema", () => {
      const innerSchema = {
        name: f.keyword(),
        value: f.text(),
      }
      const def = f.nested(innerSchema)
      expect(def.type).toBe("nested")
      expect(def.schema).toBe(innerSchema)
    })
  })

  describe("f.object", () => {
    it("should return object field definition with schema", () => {
      const innerSchema = {
        id: f.keyword(),
        count: f.integer(),
      }
      const def = f.object(innerSchema)
      expect(def.type).toBe("object")
      expect(def.schema).toBe(innerSchema)
    })
  })

  // ===========================================================================
  // Bilingual helpers
  // ===========================================================================
  describe("f.bilingualText", () => {
    it("should return object with ja/en text fields", () => {
      const def = f.bilingualText()
      expect(def.type).toBe("object")
      expect(def.schema).toEqual({
        ja: f.text(),
        en: f.text(),
      })
    })
  })

  describe("f.bilingualKeyword", () => {
    it("should return object with ja/en keyword fields", () => {
      const def = f.bilingualKeyword()
      expect(def.type).toBe("object")
      expect(def.schema).toEqual({
        ja: f.keyword(),
        en: f.keyword(),
      })
    })
  })

  describe("f.bilingualTextKw", () => {
    it("should return object with ja/en text_keyword fields", () => {
      const def = f.bilingualTextKw()
      expect(def.type).toBe("object")
      expect(def.schema).toEqual({
        ja: f.textKw(),
        en: f.textKw(),
      })
    })
  })

  describe("f.bilingualTextValue", () => {
    it("should return object with ja/en text/rawHtml structure", () => {
      const def = f.bilingualTextValue()
      expect(def.type).toBe("object")
      expect(def.schema).toBeDefined()
      const schema = def.schema!
      expect(schema.ja.type).toBe("object")
      expect(schema.en.type).toBe("object")
      // Check inner structure for ja
      const jaSchema = schema.ja.schema!
      expect(jaSchema.text.type).toBe("text")
      expect(jaSchema.rawHtml.type).toBe("noindex")
    })
  })

  describe("f.bilingualTextValueKw", () => {
    it("should return object with ja/en text_keyword/rawHtml structure", () => {
      const def = f.bilingualTextValueKw()
      expect(def.type).toBe("object")
      expect(def.schema).toBeDefined()
      const schema = def.schema!
      // Check inner structure for ja
      const jaSchema = schema.ja.schema!
      expect(jaSchema.text.type).toBe("text_keyword")
      expect(jaSchema.rawHtml.type).toBe("noindex")
    })
  })

  // ===========================================================================
  // generateMapping
  // ===========================================================================
  describe("generateMapping", () => {
    it("should generate valid ES mapping structure", () => {
      const schema = {
        id: f.keyword(),
        name: f.text(),
      }
      const mapping = generateMapping(schema)
      expect(mapping.mappings).toBeDefined()
      expect(mapping.mappings.dynamic).toBe(false)
      expect(mapping.mappings.properties).toBeDefined()
    })

    it("should convert keyword to ES keyword type", () => {
      const schema = { id: f.keyword() }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.id).toEqual({ type: "keyword" })
    })

    it("should convert text to ES text type", () => {
      const schema = { content: f.text() }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.content).toEqual({ type: "text" })
    })

    it("should convert text_keyword to text with keyword subfield", () => {
      const schema = { title: f.textKw() }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.title).toEqual({
        type: "text",
        fields: {
          kw: { type: "keyword" },
        },
      })
    })

    it("should convert date with default format", () => {
      const schema = { createdAt: f.date() }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.createdAt).toEqual({
        type: "date",
        format: "yyyy-MM-dd||yyyy-MM||yyyy",
      })
    })

    it("should convert date with custom format", () => {
      const schema = { timestamp: f.date("epoch_millis") }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.timestamp).toEqual({
        type: "date",
        format: "epoch_millis",
      })
    })

    it("should convert integer type", () => {
      const schema = { count: f.integer() }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.count).toEqual({ type: "integer" })
    })

    it("should convert long type", () => {
      const schema = { bigCount: f.long() }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.bigCount).toEqual({ type: "long" })
    })

    it("should convert float type", () => {
      const schema = { score: f.float() }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.score).toEqual({ type: "float" })
    })

    it("should convert boolean type", () => {
      const schema = { active: f.boolean() }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.active).toEqual({ type: "boolean" })
    })

    it("should convert flattened type", () => {
      const schema = { metadata: f.flattened() }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.metadata).toEqual({ type: "flattened" })
    })

    it("should convert noindex to text with index=false", () => {
      const schema = { rawHtml: f.noindex() }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.rawHtml).toEqual({ type: "text", index: false })
    })

    it("should convert disabled to object with enabled=false", () => {
      const schema = { metadata: f.disabled() }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.metadata).toEqual({ type: "object", enabled: false })
    })

    it("should convert nested type with inner properties", () => {
      const schema = {
        items: f.nested({
          id: f.keyword(),
          name: f.text(),
        }),
      }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.items).toEqual({
        type: "nested",
        properties: {
          id: { type: "keyword" },
          name: { type: "text" },
        },
      })
    })

    it("should convert object type with inner properties", () => {
      const schema = {
        address: f.object({
          city: f.keyword(),
          country: f.keyword(),
        }),
      }
      const mapping = generateMapping(schema)
      expect(mapping.mappings.properties.address).toEqual({
        type: "object",
        properties: {
          city: { type: "keyword" },
          country: { type: "keyword" },
        },
      })
    })

    it("should handle deeply nested structures", () => {
      const schema = {
        level1: f.object({
          level2: f.nested({
            level3: f.object({
              value: f.keyword(),
            }),
          }),
        }),
      }
      const mapping = generateMapping(schema)
      const level1 = mapping.mappings.properties.level1 as { properties: Record<string, unknown> }
      const level2 = level1.properties.level2 as { properties: Record<string, unknown> }
      const level3 = level2.properties.level3 as { properties: Record<string, unknown> }
      expect(level3.properties.value).toEqual({ type: "keyword" })
    })

    it("should handle bilingual text in mapping", () => {
      const schema = {
        title: f.bilingualText(),
      }
      const mapping = generateMapping(schema)
      const title = mapping.mappings.properties.title as { properties: Record<string, unknown> }
      expect(title.properties.ja).toEqual({ type: "text" })
      expect(title.properties.en).toEqual({ type: "text" })
    })

    it("should handle complex schema similar to production", () => {
      const schema = {
        humId: f.keyword(),
        title: f.bilingualText(),
        datePublished: f.date(),
        status: f.keyword(),
        dataProvider: f.nested({
          name: f.bilingualTextValue(),
          email: f.keyword(),
        }),
        versionIds: f.keyword(),
      }
      const mapping = generateMapping(schema)

      expect(mapping.mappings.properties.humId).toEqual({ type: "keyword" })
      expect(mapping.mappings.properties.datePublished).toEqual({
        type: "date",
        format: "yyyy-MM-dd||yyyy-MM||yyyy",
      })

      const dataProvider = mapping.mappings.properties.dataProvider as { type: string; properties: Record<string, unknown> }
      expect(dataProvider.type).toBe("nested")
      expect(dataProvider.properties.email).toEqual({ type: "keyword" })
    })
  })
})
