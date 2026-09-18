import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(url: string) {
  const client = postgres(url, { max: 10, prepare: false });
  return {
    db: drizzle(client, { schema }),
    ping: () => client`select 1`,
    close: () => client.end()
  };
}
