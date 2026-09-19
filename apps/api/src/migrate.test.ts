import { readMigrationFiles } from "drizzle-orm/migrator";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("database migrations", () => {
  it("ships a readable Drizzle journal and its SQL files", () => {
    const migrations = readMigrationFiles({ migrationsFolder: resolve(process.cwd(), "drizzle") });

    expect(migrations).toHaveLength(3);
    expect(migrations[0]?.sql.join("\n")).toContain('CREATE TABLE "users"');
    expect(migrations[1]?.sql.join("\n")).toContain('ADD COLUMN "experimenter"');
    expect(migrations[2]?.sql.join("\n")).toContain('CREATE TABLE "sample_history"');
  });
});
