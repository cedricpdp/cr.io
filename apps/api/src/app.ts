import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createDatabase, type Database } from "../../../packages/db/src/index.js";
import { createDemoStorage } from "./demo-storage.js";

export interface AppOptions {
  logger?: boolean;
  databaseUrl?: string;
  serveWeb?: boolean;
}

export async function buildApp(options: AppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false });
  let database: Database | undefined;

  if (options.databaseUrl) {
    database = createDatabase(options.databaseUrl);
    app.addHook("onClose", () => database?.close());
  }

  app.get("/api/health", async (_request, reply) => {
    if (database) await database.ping();
    return reply.send({
      status: "ok",
      database: database ? "ok" : "not_configured",
      version: process.env.npm_package_version ?? "0.2.0"
    });
  });

  app.get("/api/storage", async () => createDemoStorage());

  const webRoot = resolve(process.cwd(), "dist/web");
  if ((options.serveWeb ?? true) && existsSync(webRoot)) {
    await app.register(fastifyStatic, {
      root: webRoot,
      wildcard: false
    });
    app.setNotFoundHandler((_request, reply) => reply.sendFile("index.html"));
  }

  return app;
}
