import fastifyCookie from "@fastify/cookie";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createDatabase, type Database } from "../../../packages/db/src/index.js";
import { DrizzleAuthRepository } from "./auth/repository.js";
import { authRoutes, SESSION_COOKIE } from "./auth/routes.js";
import { AuthService } from "./auth/service.js";
import { createDemoStorage } from "./demo-storage.js";

export interface AppOptions {
  logger?: boolean;
  databaseUrl?: string;
  serveWeb?: boolean;
  authService?: AuthService;
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
  await app.register(authRoutes, { prefix: "/api/auth", service: authService });

  app.get("/api/health", async (_request, reply) => {
    if (database) await database.ping();
    return reply.send({
      status: "ok",
      database: database ? "ok" : "not_configured",
      version: process.env.npm_package_version ?? "0.3.0"
    });
  });

  app.get("/api/storage", async (request, reply) => {
    if (authService) {
      const token = request.cookies[SESSION_COOKIE];
      if (!token || !await authService.authenticate(token)) {
        return reply.code(401).send({ error: "unauthorized", message: "Connexion requise." });
      }
    }
    return createDemoStorage();
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
