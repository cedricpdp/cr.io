import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import type {
  CreateBox,
  CreateFreezer,
  CreateRack,
  CreateSample,
  MoveSample,
  StorageSnapshot,
  UpdateBox,
  UpdateFreezer,
  UpdateRack,
  UpdateSample
} from "../../../../packages/contracts/src/index.js";
import {
  boxes,
  freezers,
  racks,
  samples,
  type Database
} from "../../../../packages/db/src/index.js";
import { StorageConflictError, StoragePositionError } from "./errors.js";

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
  createSample(workspaceId: string, boxId: string, input: CreateSample): Promise<string | undefined>;
  updateSample(workspaceId: string, id: string, input: UpdateSample): Promise<boolean>;
  moveSample(workspaceId: string, id: string, input: MoveSample): Promise<boolean>;
  deleteSample(workspaceId: string, id: string): Promise<boolean>;
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
      recordId: samples.id,
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
        recordId: sample.recordId,
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
    const currentBox = await this.getOwnedBox(workspaceId, id);
    if (!currentBox) return false;
    const targetRows = input.rows ?? currentBox.rows;
    const targetColumns = input.columns ?? currentBox.columns;
    if (input.rows !== undefined || input.columns !== undefined) {
      const outside = await this.database.select({ id: samples.id }).from(samples)
        .where(and(eq(samples.boxId, id), or(gt(samples.row, targetRows), gt(samples.column, targetColumns)))).limit(1);
      if (outside.length) throw new StoragePositionError();
    }
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

  async createSample(workspaceId: string, boxId: string, input: CreateSample) {
    const targetBox = await this.getOwnedBox(workspaceId, boxId);
    if (!targetBox) return undefined;
    const coordinates = this.coordinates(input.position, targetBox.rows, targetBox.columns);
    return this.withConflictHandling(async () => {
      const [created] = await this.database.insert(samples).values({
        workspaceId,
        boxId,
        externalId: input.externalId,
        name: input.name,
        project: input.project,
        storedAt: new Date(`${input.storedAt}T00:00:00.000Z`),
        ...coordinates
      }).returning({ id: samples.id });
      return created?.id;
    });
  }

  async updateSample(workspaceId: string, id: string, input: UpdateSample) {
    const values = {
      ...(input.externalId === undefined ? {} : { externalId: input.externalId }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.project === undefined ? {} : { project: input.project }),
      ...(input.storedAt === undefined ? {} : { storedAt: new Date(`${input.storedAt}T00:00:00.000Z`) }),
      updatedAt: new Date()
    };
    return this.withConflictHandling(async () => {
      const rows = await this.database.update(samples).set(values)
        .where(and(eq(samples.id, id), eq(samples.workspaceId, workspaceId))).returning({ id: samples.id });
      return rows.length === 1;
    });
  }

  async moveSample(workspaceId: string, id: string, input: MoveSample) {
    if (!await this.ownsSample(workspaceId, id)) return false;
    const targetBox = await this.getOwnedBox(workspaceId, input.boxId);
    if (!targetBox) return false;
    const coordinates = this.coordinates(input.position, targetBox.rows, targetBox.columns);
    return this.withConflictHandling(async () => {
      const rows = await this.database.update(samples).set({ boxId: input.boxId, ...coordinates, updatedAt: new Date() })
        .where(and(eq(samples.id, id), eq(samples.workspaceId, workspaceId))).returning({ id: samples.id });
      return rows.length === 1;
    });
  }

  async deleteSample(workspaceId: string, id: string) {
    const rows = await this.database.delete(samples).where(and(eq(samples.id, id), eq(samples.workspaceId, workspaceId))).returning({ id: samples.id });
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

  private async ownsSample(workspaceId: string, id: string) {
    const rows = await this.database.select({ id: samples.id }).from(samples)
      .where(and(eq(samples.id, id), eq(samples.workspaceId, workspaceId))).limit(1);
    return rows.length === 1;
  }

  private async getOwnedBox(workspaceId: string, id: string) {
    const [result] = await this.database.select({ id: boxes.id, rows: boxes.rows, columns: boxes.columns }).from(boxes)
      .innerJoin(racks, eq(racks.id, boxes.rackId))
      .innerJoin(freezers, eq(freezers.id, racks.freezerId))
      .where(and(eq(boxes.id, id), eq(freezers.workspaceId, workspaceId))).limit(1);
    return result;
  }

  private coordinates(position: number, rows: number, columns: number) {
    if (position > rows * columns) throw new StoragePositionError();
    return { row: Math.floor((position - 1) / columns) + 1, column: ((position - 1) % columns) + 1 };
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
