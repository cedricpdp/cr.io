import { z } from "zod";

export const sampleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  project: z.string().min(1),
  date: z.iso.date(),
  position: z.number().int().min(1)
});

export const boxSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
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
  position: positionSchema.optional(),
  rows: z.number().int().min(1).max(32).default(8),
  columns: z.number().int().min(1).max(32).default(8)
});

export const updateBoxSchema = z.object({
  name: entityNameSchema.optional(),
  position: positionSchema.optional(),
  rows: z.number().int().min(1).max(32).optional(),
  columns: z.number().int().min(1).max(32).optional()
}).refine((value) => Object.keys(value).length > 0, "Au moins un champ est requis.");

export const entityIdParamsSchema = z.object({ id: z.uuid() });
export const freezerIdParamsSchema = z.object({ freezerId: z.uuid() });
export const rackIdParamsSchema = z.object({ rackId: z.uuid() });

export const mutationResultSchema = z.object({ id: z.uuid() });

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
