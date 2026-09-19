import { describe, expect, it } from "vitest";
import { createSampleSchema, moveSampleSchema, resolveLandingLevel, storageSnapshotSchema, type StorageSnapshot } from "./storage.js";

function snapshot(freezerCount: number, rackCount: number): StorageSnapshot {
  return {
    workspace: { id: "workspace-1", name: "Lab" },
    freezers: Array.from({ length: freezerCount }, (_, freezerIndex) => ({
      id: `freezer-${freezerIndex}`,
      name: `Freezer ${freezerIndex}`,
      temperatureCelsius: -80,
      racks: Array.from({ length: rackCount }, (_, rackIndex) => ({
        id: `rack-${rackIndex}`,
        name: `Rack ${rackIndex}`,
        boxes: []
      }))
    }))
  };
}

describe("resolveLandingLevel", () => {
  it("keeps the freezer choice when several freezers exist", () => {
    expect(resolveLandingLevel(snapshot(2, 1))).toEqual({ level: "freezers" });
  });

  it("skips a unique freezer but keeps the rack choice", () => {
    expect(resolveLandingLevel(snapshot(1, 2)).level).toBe("racks");
  });

  it("skips one freezer and one rack but never opens a box", () => {
    expect(resolveLandingLevel(snapshot(1, 1)).level).toBe("boxes");
  });

  it("validates a complete snapshot contract", () => {
    expect(storageSnapshotSchema.parse(snapshot(1, 1)).workspace.name).toBe("Lab");
  });
});

describe("sample mutations", () => {
  it("accepts a complete sample and rejects position zero", () => {
    const input = { name: "Plasma", project: "OncoMap", experimenter: "Dr Martin", description: "Témoin", storedAt: "2026-09-19", position: 1 };
    expect(createSampleSchema.parse(input).position).toBe(1);
    expect(createSampleSchema.safeParse({ ...input, position: 0 }).success).toBe(false);
  });

  it("requires a UUID target box for a move", () => {
    expect(moveSampleSchema.safeParse({ boxId: "box-1", position: 1 }).success).toBe(false);
    expect(moveSampleSchema.safeParse({ boxId: "00000000-0000-4000-8000-000000000030", position: 1 }).success).toBe(true);
  });
});
