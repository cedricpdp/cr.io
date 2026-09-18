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

export type Sample = z.infer<typeof sampleSchema>;
export type StorageBox = z.infer<typeof boxSchema>;
export type Rack = z.infer<typeof rackSchema>;
export type Freezer = z.infer<typeof freezerSchema>;
export type StorageSnapshot = z.infer<typeof storageSnapshotSchema>;
export type Health = z.infer<typeof healthSchema>;

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
