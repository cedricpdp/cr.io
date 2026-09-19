import { z } from "zod";

export const sampleSchema = z.object({
  recordId: z.uuid().optional(),
  name: z.string().min(1),
  project: z.string().min(1),
  experimenter: z.string(),
  description: z.string(),
  date: z.iso.date(),
  position: z.number().int().min(1),
  history: z.array(z.object({
    id: z.uuid(),
    actorName: z.string().min(1),
    action: z.enum(["created", "updated", "moved"]),
    details: z.string().min(1),
    createdAt: z.iso.datetime()
  })).default([])
});

export const boxSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  project: z.string(),
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  samples: z.array(sampleSchema)
});

export const rackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  boxes: z.array(boxSchema)
});

export const freezerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  temperatureCelsius: z.number(),
  racks: z.array(rackSchema)
});

export const storageSnapshotSchema = z.object({
  workspace: z.object({
    id: z.string().min(1),
    name: z.string().min(1)
  }),
  freezers: z.array(freezerSchema)
});

export const healthSchema = z.object({
  status: z.literal("ok"),
  database: z.enum(["ok", "not_configured"]),
  version: z.string()
});

const entityNameSchema = z.string().trim().min(1).max(120);
const positionSchema = z.number().int().positive();

export const createFreezerSchema = z.object({
  name: entityNameSchema,
  temperatureCelsius: z.number().int().min(-196).max(30)
});

export const updateFreezerSchema = createFreezerSchema.partial().refine((value) => Object.keys(value).length > 0, "Au moins un champ est requis.");

export const createRackSchema = z.object({
  name: entityNameSchema,
  position: positionSchema.optional()
});

export const updateRackSchema = z.object({
  name: entityNameSchema.optional(),
  position: positionSchema.optional()
}).refine((value) => Object.keys(value).length > 0, "Au moins un champ est requis.");

export const createBoxSchema = z.object({
  name: entityNameSchema,
  project: z.string().trim().max(160).default(""),
  position: positionSchema.optional(),
  rows: z.number().int().min(1).max(32).default(8),
  columns: z.number().int().min(1).max(32).default(8)
});

export const updateBoxSchema = z.object({
  name: entityNameSchema.optional(),
  project: z.string().trim().max(160).optional(),
  position: positionSchema.optional(),
  rows: z.number().int().min(1).max(32).optional(),
  columns: z.number().int().min(1).max(32).optional()
}).refine((value) => Object.keys(value).length > 0, "Au moins un champ est requis.");

export const entityIdParamsSchema = z.object({ id: z.uuid() });
export const freezerIdParamsSchema = z.object({ freezerId: z.uuid() });
export const rackIdParamsSchema = z.object({ rackId: z.uuid() });

export const mutationResultSchema = z.object({ id: z.uuid() });

export const createSampleSchema = z.object({
  name: z.string().trim().min(1).max(160),
  project: z.string().trim().min(1).max(160),
  experimenter: z.string().trim().max(160).default(""),
  description: z.string().trim().max(2000).default(""),
  storedAt: z.iso.date(),
  position: positionSchema
});

export const updateSampleSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  project: z.string().trim().min(1).max(160).optional(),
  experimenter: z.string().trim().max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  storedAt: z.iso.date().optional()
}).refine((value) => Object.keys(value).length > 0, "Au moins un champ est requis.");

export const moveSampleSchema = z.object({
  boxId: z.uuid(),
  position: positionSchema
});

export const exportSamplesQuerySchema = z.object({
  freezerId: z.uuid().optional(),
  rackId: z.uuid().optional(),
  boxId: z.uuid().optional()
});

export const boxIdParamsSchema = z.object({ boxId: z.uuid() });

export type Sample = z.infer<typeof sampleSchema>;
export type StorageBox = z.infer<typeof boxSchema>;
export type Rack = z.infer<typeof rackSchema>;
export type Freezer = z.infer<typeof freezerSchema>;
export type StorageSnapshot = z.infer<typeof storageSnapshotSchema>;
export type Health = z.infer<typeof healthSchema>;
export type CreateFreezer = z.infer<typeof createFreezerSchema>;
export type UpdateFreezer = z.infer<typeof updateFreezerSchema>;
export type CreateRack = z.infer<typeof createRackSchema>;
export type UpdateRack = z.infer<typeof updateRackSchema>;
export type CreateBox = z.infer<typeof createBoxSchema>;
export type UpdateBox = z.infer<typeof updateBoxSchema>;
export type CreateSample = z.infer<typeof createSampleSchema>;
export type UpdateSample = z.infer<typeof updateSampleSchema>;
export type MoveSample = z.infer<typeof moveSampleSchema>;
export type ExportSamplesQuery = z.infer<typeof exportSamplesQuerySchema>;

export type LandingLevel =
  | { level: "freezers" }
  | { level: "racks"; freezer: Freezer }
  | { level: "boxes"; freezer: Freezer; rack: Rack };

export function resolveLandingLevel(snapshot: StorageSnapshot): LandingLevel {
  if (snapshot.freezers.length !== 1) return { level: "freezers" };

  const freezer = snapshot.freezers[0];
  if (freezer.racks.length !== 1) return { level: "racks", freezer };

  return { level: "boxes", freezer, rack: freezer.racks[0] };
}
