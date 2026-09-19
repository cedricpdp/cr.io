import { describe, expect, it } from "vitest";
import { sampleSearchResponseSchema, searchQuerySchema } from "./search.js";

describe("search contracts", () => {
  it("defaults to an empty query and a bounded result count", () => {
    expect(searchQuerySchema.parse({})).toEqual({ q: "", limit: 20 });
    expect(searchQuerySchema.parse({ q: " plasma ", limit: "12" })).toEqual({ q: "plasma", limit: 12 });
    expect(searchQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it("validates the complete sample location", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const response = sampleSearchResponseSchema.parse({
      results: [{
        recordId: id,
        externalId: "CR-001",
        name: "Plasma",
        project: "OncoMap",
        storedAt: "2026-09-19",
        position: 1,
        box: { id, name: "Box 01" },
        rack: { id, name: "Rack A" },
        freezer: { id, name: "Freezer −80 °C" }
      }]
    });
    expect(response.results[0]?.box.name).toBe("Box 01");
  });
});
