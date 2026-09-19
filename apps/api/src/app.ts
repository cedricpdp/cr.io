import fastifyCookie from "@fastify/cookie";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createDatabase, type Database } from "../../../packages/db/src/index.js";
import { DrizzleAuthRepository } from "./auth/repository.js";
import { authRoutes } from "./auth/routes.js";
import { AuthService } from "./auth/service.js";
import { DrizzleStorageRepository, type StorageRepository } from "./storage/repository.js";
import { storageRoutes } from "./storage/routes.js";

export interface AppOptions {
  logger?: boolean;
  databaseUrl?: string;
  serveWeb?: boolean;
  authService?: AuthService;
  storageRepository?: StorageRepository;
}

export async function buildApp(options: AppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false });
  let database: Database | undefined;

  if (options.databaseUrl) {
    database = createDatabase(options.databaseUrl);
    app.addHook("onClose", () => database?.close());
  }

  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });

  const authService = options.authService ?? (database ? new AuthService(new DrizzleAuthRepository(database.db)) : undefined);
  const storageRepository = options.storageRepository ?? (database ? new DrizzleStorageRepository(database.db) : undefined);
  await app.register(authRoutes, { prefix: "/api/auth", service: authService });
  await app.register(storageRoutes, { prefix: "/api", authService, repository: storageRepository });

  app.get("/api/live", async (_request, reply) => reply.send({
    status: "ok",
    version: process.env.npm_package_version ?? "0.7.1"
  }));

  app.get("/api/health", async (_request, reply) => {
    if (database) await database.ping();
    return reply.send({
      status: "ok",
      database: database ? "ok" : "not_configured",
      version: process.env.npm_package_version ?? "0.7.1"
    });
  });

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
