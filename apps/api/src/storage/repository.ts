import { and, asc, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import type {
  CreateBox,
  CreateFreezer,
  CreateRack,
  CreateSample,
  ExportSamplesQuery,
  MoveSample,
  SampleSearchResult,
  SearchQuery,
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
  sampleHistory,
  samples,
  type Database
} from "../../../../packages/db/src/index.js";
import { StorageConflictError, StoragePositionError } from "./errors.js";

type DrizzleDatabase = Database["db"];

export interface StorageActor {
  userId: string;
  displayName: string;
}

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
  createSample(workspaceId: string, boxId: string, input: CreateSample, actor: StorageActor): Promise<string | undefined>;
  updateSample(workspaceId: string, id: string, input: UpdateSample, actor: StorageActor): Promise<boolean>;
  moveSample(workspaceId: string, id: string, input: MoveSample, actor: StorageActor): Promise<boolean>;
  deleteSample(workspaceId: string, id: string): Promise<boolean>;
  wipeStorage(workspaceId: string): Promise<void>;
  searchSamples(workspaceId: string, input: SearchQuery): Promise<SampleSearchResult[]>;
  exportSamples(workspaceId: string, filter?: ExportSamplesQuery): Promise<SampleExportRow[]>;
}

export interface SampleExportRow {
  name: string;
  project: string;
  experimenter: string;
  description: string;
  storedAt: string;
  freezer: string;
  rack: string;
  box: string;
  position: number;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function positionLabel(position: number, columns: number) {
  let row = Math.floor((position - 1) / columns) + 1;
  let label = "";
  while (row > 0) {
    row -= 1;
    label = String.fromCharCode(65 + (row % 26)) + label;
    row = Math.floor(row / 26);
  }
  return `${label}${((position - 1) % columns) + 1}`;
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
      name: samples.name,
      project: samples.project,
      experimenter: samples.experimenter,
      description: samples.description,
      row: samples.row,
      column: samples.column,
      storedAt: samples.storedAt,
      boxColumns: boxes.columns
    }).from(samples)
      .innerJoin(boxes, eq(boxes.id, samples.boxId))
      .innerJoin(racks, eq(racks.id, boxes.rackId))
      .innerJoin(freezers, eq(freezers.id, racks.freezerId))
      .where(eq(freezers.workspaceId, workspaceId));
    const historyRows = await this.database.select({
      id: sampleHistory.id,
      sampleId: sampleHistory.sampleId,
      actorName: sampleHistory.actorName,
      action: sampleHistory.action,
      details: sampleHistory.details,
      createdAt: sampleHistory.createdAt
    }).from(sampleHistory)
      .where(eq(sampleHistory.workspaceId, workspaceId))
      .orderBy(desc(sampleHistory.createdAt));
    const historyBySample = new Map<string, StorageSnapshot["freezers"][number]["racks"][number]["boxes"][number]["samples"][number]["history"]>();
    for (const entry of historyRows) {
      if (entry.action !== "created" && entry.action !== "updated" && entry.action !== "moved") continue;
      const history = historyBySample.get(entry.sampleId) ?? [];
      history.push({ ...entry, action: entry.action, createdAt: entry.createdAt.toISOString() });
      historyBySample.set(entry.sampleId, history);
    }

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
      const result = { id: box.id, name: box.name, project: box.project, rows: box.rows, columns: box.columns, samples: [] as StorageSnapshot["freezers"][number]["racks"][number]["boxes"][number]["samples"] };
      boxMap.set(box.id, result);
      rackMap.get(box.rackId)?.boxes.push(result);
    }
    for (const sample of sampleRows) {
      boxMap.get(sample.boxId)?.samples.push({
        recordId: sample.recordId,
        name: sample.name,
        project: sample.project,
        experimenter: sample.experimenter,
        description: sample.description,
        date: sample.storedAt.toISOString().slice(0, 10),
        position: (sample.row - 1) * sample.boxColumns + sample.column,
        history: historyBySample.get(sample.recordId) ?? []
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

  async createSample(workspaceId: string, boxId: string, input: CreateSample, actor: StorageActor) {
    const targetBox = await this.getOwnedBox(workspaceId, boxId);
    if (!targetBox) return undefined;
    const coordinates = this.coordinates(input.position, targetBox.rows, targetBox.columns);
    return this.withConflictHandling(async () => {
      return this.database.transaction(async (transaction) => {
        const [created] = await transaction.insert(samples).values({
          workspaceId,
          boxId,
          name: input.name,
          project: input.project,
          experimenter: input.experimenter,
          description: input.description,
          storedAt: new Date(`${input.storedAt}T00:00:00.000Z`),
          ...coordinates
        }).returning({ id: samples.id });
        if (!created) return undefined;
        await transaction.insert(sampleHistory).values({
          sampleId: created.id,
          workspaceId,
          actorUserId: actor.userId,
          actorName: actor.displayName,
          action: "created",
          details: `Création dans ${targetBox.name} en ${positionLabel(input.position, targetBox.columns)}`
        });
        return created.id;
      });
    });
  }

  async updateSample(workspaceId: string, id: string, input: UpdateSample, actor: StorageActor) {
    const values = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.project === undefined ? {} : { project: input.project }),
      ...(input.experimenter === undefined ? {} : { experimenter: input.experimenter }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.storedAt === undefined ? {} : { storedAt: new Date(`${input.storedAt}T00:00:00.000Z`) }),
      updatedAt: new Date()
    };
    return this.withConflictHandling(async () => {
      return this.database.transaction(async (transaction) => {
        const [current] = await transaction.select({
          name: samples.name,
          project: samples.project,
          experimenter: samples.experimenter,
          description: samples.description,
          storedAt: samples.storedAt
        }).from(samples).where(and(eq(samples.id, id), eq(samples.workspaceId, workspaceId))).limit(1);
        if (!current) return false;
        const rows = await transaction.update(samples).set(values)
          .where(and(eq(samples.id, id), eq(samples.workspaceId, workspaceId))).returning({ id: samples.id });
        if (rows.length !== 1) return false;
        const labels: Record<keyof UpdateSample, string> = { name: "nom", project: "projet", experimenter: "expérimentateur", description: "description", storedAt: "date de stockage" };
        const currentValues: Record<keyof UpdateSample, string> = {
          name: current.name,
          project: current.project,
          experimenter: current.experimenter,
          description: current.description,
          storedAt: current.storedAt.toISOString().slice(0, 10)
        };
        const changed = (Object.keys(input) as (keyof UpdateSample)[])
          .filter((key) => input[key] !== currentValues[key])
          .map((key) => labels[key]);
        if (changed.length) {
          await transaction.insert(sampleHistory).values({ sampleId: id, workspaceId, actorUserId: actor.userId, actorName: actor.displayName, action: "updated", details: `Modification : ${changed.join(", ")}` });
        }
        return true;
      });
    });
  }

  async moveSample(workspaceId: string, id: string, input: MoveSample, actor: StorageActor) {
    const origin = await this.getOwnedSampleLocation(workspaceId, id);
    if (!origin) return false;
    const targetBox = await this.getOwnedBox(workspaceId, input.boxId);
    if (!targetBox) return false;
    const coordinates = this.coordinates(input.position, targetBox.rows, targetBox.columns);
    return this.withConflictHandling(async () => {
      return this.database.transaction(async (transaction) => {
        const rows = await transaction.update(samples).set({ boxId: input.boxId, ...coordinates, updatedAt: new Date() })
          .where(and(eq(samples.id, id), eq(samples.workspaceId, workspaceId))).returning({ id: samples.id });
        if (rows.length !== 1) return false;
        await transaction.insert(sampleHistory).values({
          sampleId: id,
          workspaceId,
          actorUserId: actor.userId,
          actorName: actor.displayName,
          action: "moved",
          details: `Déplacement de ${origin.boxName} / ${positionLabel((origin.row - 1) * origin.columns + origin.column, origin.columns)} vers ${targetBox.name} / ${positionLabel(input.position, targetBox.columns)}`
        });
        return true;
      });
    });
  }

  async deleteSample(workspaceId: string, id: string) {
    const rows = await this.database.delete(samples).where(and(eq(samples.id, id), eq(samples.workspaceId, workspaceId))).returning({ id: samples.id });
    return rows.length === 1;
  }

  async wipeStorage(workspaceId: string) {
    await this.database.delete(freezers).where(eq(freezers.workspaceId, workspaceId));
  }

  async searchSamples(workspaceId: string, input: SearchQuery): Promise<SampleSearchResult[]> {
    const term = `%${input.q}%`;
    const rows = await this.database.select({
      recordId: samples.id,
      name: samples.name,
      project: samples.project,
      experimenter: samples.experimenter,
      description: samples.description,
      storedAt: samples.storedAt,
      row: samples.row,
      column: samples.column,
      boxColumns: boxes.columns,
      boxId: boxes.id,
      boxName: boxes.name,
      rackId: racks.id,
      rackName: racks.name,
      freezerId: freezers.id,
      freezerName: freezers.name
    }).from(samples)
      .innerJoin(boxes, eq(boxes.id, samples.boxId))
      .innerJoin(racks, eq(racks.id, boxes.rackId))
      .innerJoin(freezers, eq(freezers.id, racks.freezerId))
      .where(input.q ? and(
        eq(samples.workspaceId, workspaceId),
        or(ilike(samples.name, term), ilike(samples.project, term), ilike(samples.experimenter, term), ilike(samples.description, term), ilike(boxes.name, term))
      ) : eq(samples.workspaceId, workspaceId))
      .orderBy(asc(samples.name))
      .limit(input.limit);

    return rows.map((row) => ({
      recordId: row.recordId,
      name: row.name,
      project: row.project,
      experimenter: row.experimenter,
      description: row.description,
      storedAt: row.storedAt.toISOString().slice(0, 10),
      position: (row.row - 1) * row.boxColumns + row.column,
      box: { id: row.boxId, name: row.boxName },
      rack: { id: row.rackId, name: row.rackName },
      freezer: { id: row.freezerId, name: row.freezerName }
    }));
  }

  async exportSamples(workspaceId: string, filter: ExportSamplesQuery = {}): Promise<SampleExportRow[]> {
    const conditions = [eq(samples.workspaceId, workspaceId)];
    if (filter.freezerId) conditions.push(eq(freezers.id, filter.freezerId));
    if (filter.rackId) conditions.push(eq(racks.id, filter.rackId));
    if (filter.boxId) conditions.push(eq(boxes.id, filter.boxId));
    const rows = await this.database.select({
      name: samples.name,
      project: samples.project,
      experimenter: samples.experimenter,
      description: samples.description,
      storedAt: samples.storedAt,
      row: samples.row,
      column: samples.column,
      boxColumns: boxes.columns,
      boxName: boxes.name,
      rackName: racks.name,
      freezerName: freezers.name
    }).from(samples)
      .innerJoin(boxes, eq(boxes.id, samples.boxId))
      .innerJoin(racks, eq(racks.id, boxes.rackId))
      .innerJoin(freezers, eq(freezers.id, racks.freezerId))
      .where(and(...conditions))
      .orderBy(asc(freezers.name), asc(racks.position), asc(boxes.position), asc(samples.row), asc(samples.column));

    return rows.map((row) => ({
      name: row.name,
      project: row.project,
      experimenter: row.experimenter,
      description: row.description,
      storedAt: row.storedAt.toISOString().slice(0, 10),
      freezer: row.freezerName,
      rack: row.rackName,
      box: row.boxName,
      position: (row.row - 1) * row.boxColumns + row.column
    }));
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

  private async getOwnedBox(workspaceId: string, id: string) {
    const [result] = await this.database.select({ id: boxes.id, name: boxes.name, rows: boxes.rows, columns: boxes.columns }).from(boxes)
      .innerJoin(racks, eq(racks.id, boxes.rackId))
      .innerJoin(freezers, eq(freezers.id, racks.freezerId))
      .where(and(eq(boxes.id, id), eq(freezers.workspaceId, workspaceId))).limit(1);
    return result;
  }

  private async getOwnedSampleLocation(workspaceId: string, id: string) {
    const [result] = await this.database.select({ row: samples.row, column: samples.column, boxName: boxes.name, columns: boxes.columns })
      .from(samples)
      .innerJoin(boxes, eq(boxes.id, samples.boxId))
      .where(and(eq(samples.id, id), eq(samples.workspaceId, workspaceId)))
      .limit(1);
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
