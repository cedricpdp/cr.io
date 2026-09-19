import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolve } from "node:path";
import { createDatabase } from "../../../packages/db/src/index.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("[database] migration skipped: DATABASE_URL is not configured");
} else {
  const database = createDatabase(databaseUrl);
  try {
    await migrate(database.db, {
      migrationsFolder: resolve(process.cwd(), process.env.MIGRATIONS_DIR ?? "drizzle")
    });
    console.log("[database] migrations applied");
  } finally {
    await database.close();
  }
}
