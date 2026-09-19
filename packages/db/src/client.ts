import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDatabase>;

export function normalizeDatabaseUrl(url: string) {
  const normalized = new URL(url);
  // Neon currently adds this libpq option, which postgres.js does not implement.
  normalized.searchParams.delete("channel_binding");
  return normalized.toString();
}

export function createDatabase(url: string) {
  const client = postgres(normalizeDatabaseUrl(url), { max: 10, prepare: false });
  return {
    db: drizzle(client, { schema }),
    ping: () => client`select 1`,
    close: () => client.end()
  };
}
