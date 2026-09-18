import { and, asc, eq, sql } from "drizzle-orm";
import type {
  CreateBox,
  CreateFreezer,
  CreateRack,
  StorageSnapshot,
  UpdateBox,
  UpdateFreezer,
  UpdateRack
} from "../../../../packages/contracts/src/index.js";
import {
  boxes,
  freezers,
  racks,
  samples,
  type Database
} from "../../../../packages/db/src/index.js";
import { StorageConflictError } from "./errors.js";

type DrizzleDatabase = Database["db"];

export interface StorageRepository {
  getSnapshot(workspaceId: string, workspaceName: string): Promise<StorageSnapshot>;
  createFreezer(workspaceId: string, input: CreateFreezer): Promise<string>;
  updateFreezer(workspaceId: string, id: string, input: UpdateFreezer): Promise<boolean>;
  deleteFreezer(workspaceId: string, id: string): Promise<boolean>;
  createRack(workspaceId: string, freezerId: string, input: CreateRack): Promise<string | undefined>;
  updateRack(workspaceId: string, id: string, input: UpdateRack): Promise<boolean>;
  deleteRack(workspaceId: string, id: string): Promise<boolean>;
  createBox(workspaceId: string, rackId: string, input: CreateBox): Promise<string | undefined>;
  updateBox(workspaceId: string, id: string, input: UpdateBox): Promise<boolean>;
  deleteBox(workspaceId: string, id: string): Promise<boolean>;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export class DrizzleStorageRepository implements StorageRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  async getSnapshot(workspaceId: string, workspaceName: string): Promise<StorageSnapshot> {
    const freezerRows = await this.database.select().from(freezers).where(eq(freezers.workspaceId, workspaceId)).orderBy(asc(freezers.name));
    const rackRows = await this.database.select({ rack: racks }).from(racks)
      .innerJoin(freezers, eq(freezers.id, racks.freezerId))
      .where(eq(freezers.workspaceId, workspaceId))
      .orderBy(asc(racks.position));
    const boxRows = await this.database.select({ box: boxes }).from(boxes)
      .innerJoin(racks, eq(racks.id, boxes.rackId))
      .innerJoin(freezers, eq(freezers.id, racks.freezerId))
      .where(eq(freezers.workspaceId, workspaceId))
      .orderBy(asc(boxes.position));
    const sampleRows = await this.database.select({
      boxId: samples.boxId,
      id: samples.externalId,
      name: samples.name,
      project: samples.project,
      row: samples.row,
      column: samples.column,
      storedAt: samples.storedAt,
      boxColumns: boxes.columns
    }).from(samples)
      .innerJoin(boxes, eq(boxes.id, samples.boxId))
      .innerJoin(racks, eq(racks.id, boxes.rackId))
      .innerJoin(freezers, eq(freezers.id, racks.freezerId))
      .where(eq(freezers.workspaceId, workspaceId));

    const freezerMap = new Map(freezerRows.map((freezer) => [freezer.id, {
      id: freezer.id,
      name: freezer.name,
      temperatureCelsius: freezer.temperatureCelsius,
      racks: [] as StorageSnapshot["freezers"][number]["racks"]
    }]));
    const rackMap = new Map<string, StorageSnapshot["freezers"][number]["racks"][number]>();
    for (const { rack } of rackRows) {
      const result = { id: rack.id, name: rack.name, boxes: [] as StorageSnapshot["freezers"][number]["racks"][number]["boxes"] };
      rackMap.set(rack.id, result);
      freezerMap.get(rack.freezerId)?.racks.push(result);
    }
    const boxMap = new Map<string, StorageSnapshot["freezers"][number]["racks"][number]["boxes"][number]>();
    for (const { box } of boxRows) {
      const result = { id: box.id, name: box.name, rows: box.rows, columns: box.columns, samples: [] as StorageSnapshot["freezers"][number]["racks"][number]["boxes"][number]["samples"] };
      boxMap.set(box.id, result);
      rackMap.get(box.rackId)?.boxes.push(result);
    }
    for (const sample of sampleRows) {
      boxMap.get(sample.boxId)?.samples.push({
        id: sample.id,
        name: sample.name,
        project: sample.project,
        date: sample.storedAt.toISOString().slice(0, 10),
        position: (sample.row - 1) * sample.boxColumns + sample.column
      });
    }

    return { workspace: { id: workspaceId, name: workspaceName }, freezers: [...freezerMap.values()] };
  }

  async createFreezer(workspaceId: string, input: CreateFreezer) {
    return this.withConflictHandling(async () => {
      const [created] = await this.database.insert(freezers).values({ workspaceId, ...input }).returning({ id: freezers.id });
      if (!created) throw new Error("Freezer creation returned no row");
      return created.id;
    });
  }

  async updateFreezer(workspaceId: string, id: string, input: UpdateFreezer) {
    return this.withConflictHandling(async () => {
      const rows = await this.database.update(freezers).set({ ...input, updatedAt: new Date() })
        .where(and(eq(freezers.id, id), eq(freezers.workspaceId, workspaceId))).returning({ id: freezers.id });
      return rows.length === 1;
    });
  }

  async deleteFreezer(workspaceId: string, id: string) {
    const rows = await this.database.delete(freezers).where(and(eq(freezers.id, id), eq(freezers.workspaceId, workspaceId))).returning({ id: freezers.id });
    return rows.length === 1;
  }

  async createRack(workspaceId: string, freezerId: string, input: CreateRack) {
    if (!await this.ownsFreezer(workspaceId, freezerId)) return undefined;
    return this.withConflictHandling(async () => {
      const position = input.position ?? await this.nextRackPosition(freezerId);
      const [created] = await this.database.insert(racks).values({ freezerId, name: input.name, position }).returning({ id: racks.id });
      return created?.id;
    });
  }

  async updateRack(workspaceId: string, id: string, input: UpdateRack) {
    if (!await this.ownsRack(workspaceId, id)) return false;
    return this.withConflictHandling(async () => {
      const rows = await this.database.update(racks).set({ ...input, updatedAt: new Date() }).where(eq(racks.id, id)).returning({ id: racks.id });
      return rows.length === 1;
    });
  }

  async deleteRack(workspaceId: string, id: string) {
    if (!await this.ownsRack(workspaceId, id)) return false;
    const rows = await this.database.delete(racks).where(eq(racks.id, id)).returning({ id: racks.id });
    return rows.length === 1;
  }

  async createBox(workspaceId: string, rackId: string, input: CreateBox) {
    if (!await this.ownsRack(workspaceId, rackId)) return undefined;
    return this.withConflictHandling(async () => {
      const position = input.position ?? await this.nextBoxPosition(rackId);
      const [created] = await this.database.insert(boxes).values({ rackId, ...input, position }).returning({ id: boxes.id });
      return created?.id;
    });
  }

  async updateBox(workspaceId: string, id: string, input: UpdateBox) {
    if (!await this.ownsBox(workspaceId, id)) return false;
    return this.withConflictHandling(async () => {
      const rows = await this.database.update(boxes).set({ ...input, updatedAt: new Date() }).where(eq(boxes.id, id)).returning({ id: boxes.id });
      return rows.length === 1;
    });
  }

  async deleteBox(workspaceId: string, id: string) {
    if (!await this.ownsBox(workspaceId, id)) return false;
    const rows = await this.database.delete(boxes).where(eq(boxes.id, id)).returning({ id: boxes.id });
    return rows.length === 1;
  }

  private async ownsFreezer(workspaceId: string, id: string) {
    const rows = await this.database.select({ id: freezers.id }).from(freezers).where(and(eq(freezers.id, id), eq(freezers.workspaceId, workspaceId))).limit(1);
    return rows.length === 1;
  }

  private async ownsRack(workspaceId: string, id: string) {
    const rows = await this.database.select({ id: racks.id }).from(racks)
      .innerJoin(freezers, eq(freezers.id, racks.freezerId))
      .where(and(eq(racks.id, id), eq(freezers.workspaceId, workspaceId))).limit(1);
    return rows.length === 1;
  }

  private async ownsBox(workspaceId: string, id: string) {
    const rows = await this.database.select({ id: boxes.id }).from(boxes)
      .innerJoin(racks, eq(racks.id, boxes.rackId))
      .innerJoin(freezers, eq(freezers.id, racks.freezerId))
      .where(and(eq(boxes.id, id), eq(freezers.workspaceId, workspaceId))).limit(1);
    return rows.length === 1;
  }

  private async nextRackPosition(freezerId: string) {
    const [result] = await this.database.select({ value: sql<number>`coalesce(max(${racks.position}), 0) + 1` }).from(racks).where(eq(racks.freezerId, freezerId));
    return Number(result?.value ?? 1);
  }

  private async nextBoxPosition(rackId: string) {
    const [result] = await this.database.select({ value: sql<number>`coalesce(max(${boxes.position}), 0) + 1` }).from(boxes).where(eq(boxes.rackId, rackId));
    return Number(result?.value ?? 1);
  }

  private async withConflictHandling<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueViolation(error)) throw new StorageConflictError();
      throw error;
    }
  }
}
