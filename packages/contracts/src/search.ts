import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export const sampleSearchResultSchema = z.object({
  recordId: z.uuid(),
  name: z.string(),
  project: z.string(),
  experimenter: z.string(),
  description: z.string(),
  storedAt: z.iso.date(),
  position: z.number().int().positive(),
  box: z.object({ id: z.uuid(), name: z.string() }),
  rack: z.object({ id: z.uuid(), name: z.string() }),
  freezer: z.object({ id: z.uuid(), name: z.string() })
});

export const sampleSearchResponseSchema = z.object({
  results: z.array(sampleSearchResultSchema)
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SampleSearchResult = z.infer<typeof sampleSearchResultSchema>;
