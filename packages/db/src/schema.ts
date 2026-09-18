import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const workspaceRole = pgEnum("workspace_role", ["owner", "admin", "member"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  ...timestamps
}, (table) => [uniqueIndex("users_email_unique").on(sql`lower(${table.email})`)]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ...timestamps
});

export const workspaceMembers = pgTable("workspace_members", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: workspaceRole("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.userId] }),
  index("workspace_members_user_idx").on(table.userId)
]);

export const freezers = pgTable("freezers", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  temperatureCelsius: integer("temperature_celsius").notNull(),
  ...timestamps
}, (table) => [
  uniqueIndex("freezers_workspace_name_unique").on(table.workspaceId, table.name),
  index("freezers_workspace_idx").on(table.workspaceId)
]);

export const racks = pgTable("racks", {
  id: uuid("id").primaryKey().defaultRandom(),
  freezerId: uuid("freezer_id").notNull().references(() => freezers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  ...timestamps
}, (table) => [
  uniqueIndex("racks_freezer_name_unique").on(table.freezerId, table.name),
  uniqueIndex("racks_freezer_position_unique").on(table.freezerId, table.position),
  check("racks_position_positive", sql`${table.position} > 0`)
]);

export const boxes = pgTable("boxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  rackId: uuid("rack_id").notNull().references(() => racks.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  rows: integer("rows").notNull().default(8),
  columns: integer("columns").notNull().default(8),
  ...timestamps
}, (table) => [
  uniqueIndex("boxes_rack_name_unique").on(table.rackId, table.name),
  uniqueIndex("boxes_rack_position_unique").on(table.rackId, table.position),
  check("boxes_position_positive", sql`${table.position} > 0`),
  check("boxes_dimensions_positive", sql`${table.rows} > 0 and ${table.columns} > 0`)
]);

export const samples = pgTable("samples", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  boxId: uuid("box_id").notNull().references(() => boxes.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  name: text("name").notNull(),
  project: text("project").notNull(),
  row: integer("row").notNull(),
  column: integer("column").notNull(),
  storedAt: timestamp("stored_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps
}, (table) => [
  uniqueIndex("samples_workspace_external_id_unique").on(table.workspaceId, table.externalId),
  uniqueIndex("samples_box_position_unique").on(table.boxId, table.row, table.column),
  index("samples_workspace_name_idx").on(table.workspaceId, table.name),
  check("samples_row_positive", sql`${table.row} > 0`),
  check("samples_column_positive", sql`${table.column} > 0`)
]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
  index("sessions_user_idx").on(table.userId),
  index("sessions_expires_idx").on(table.expiresAt)
]);
