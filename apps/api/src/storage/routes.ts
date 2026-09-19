import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { ZodError, type ZodType } from "zod";
import {
  boxIdParamsSchema,
  createBoxSchema,
  createFreezerSchema,
  createRackSchema,
  createSampleSchema,
  entityIdParamsSchema,
  freezerIdParamsSchema,
  moveSampleSchema,
  rackIdParamsSchema,
  searchQuerySchema,
  updateBoxSchema,
  updateFreezerSchema,
  updateRackSchema,
  updateSampleSchema
} from "../../../../packages/contracts/src/index.js";
import { SESSION_COOKIE } from "../auth/routes.js";
import type { AuthService } from "../auth/service.js";
import { createDemoStorage } from "../demo-storage.js";
import { StorageConflictError, StoragePositionError } from "./errors.js";
import { renderSamplesCsv } from "./csv.js";
import type { StorageRepository } from "./repository.js";

export interface StorageRoutesOptions {
  authService?: AuthService;
  repository?: StorageRepository;
}

function validationError(reply: FastifyReply, error: ZodError) {
  return reply.code(400).send({ error: "validation_error", message: error.issues[0]?.message ?? "Données invalides." });
}

function unavailable(reply: FastifyReply) {
  return reply.code(503).send({ error: "database_unavailable", message: "La base de données n’est pas configurée." });
}

async function workspaceFor(request: FastifyRequest, reply: FastifyReply, authService?: AuthService) {
  const token = request.cookies[SESSION_COOKIE];
  const session = token && authService ? await authService.authenticate(token) : undefined;
  if (!session) {
    void reply.code(401).send({ error: "unauthorized", message: "Connexion requise." });
    return undefined;
  }
  return session.workspace;
}

function parse<T>(schema: ZodType<T>, value: unknown, reply: FastifyReply): T | undefined {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) void validationError(reply, error);
    else throw error;
    return undefined;
  }
}

async function mutation(reply: FastifyReply, operation: () => Promise<string | boolean | undefined>) {
  try {
    const result = await operation();
    if (!result) return reply.code(404).send({ error: "not_found", message: "Élément introuvable." });
    if (typeof result === "string") return reply.code(201).send({ id: result });
    return reply.code(204).send();
  } catch (error) {
    if (error instanceof StorageConflictError) return reply.code(409).send({ error: "conflict", message: "Ce nom, cet identifiant ou cette position est déjà utilisé." });
    if (error instanceof StoragePositionError) return reply.code(400).send({ error: "invalid_position", message: "La position est incompatible avec les dimensions de la box." });
    throw error;
  }
}

export const storageRoutes: FastifyPluginAsync<StorageRoutesOptions> = async (app, options) => {
  app.get("/storage", async (request, reply) => {
    if (!options.authService) return createDemoStorage();
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    if (!options.repository) return createDemoStorage();
    return options.repository.getSnapshot(workspace.id, workspace.name);
  });

  app.get("/search", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const query = parse(searchQuerySchema, request.query, reply);
    if (!query) return;
    return { results: await options.repository.searchSamples(workspace.id, query) };
  });

  app.get("/export/samples.csv", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const csv = renderSamplesCsv(await options.repository.exportSamples(workspace.id));
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="crio-samples.csv"')
      .header("cache-control", "no-store")
      .send(csv);
  });

  app.post("/freezers", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const input = parse(createFreezerSchema, request.body, reply);
    if (!input) return;
    return mutation(reply, () => options.repository!.createFreezer(workspace.id, input));
  });

  app.patch("/freezers/:id", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const params = parse(entityIdParamsSchema, request.params, reply);
    if (!params) return;
    const input = parse(updateFreezerSchema, request.body, reply);
    if (!input) return;
    return mutation(reply, () => options.repository!.updateFreezer(workspace.id, params.id, input));
  });

  app.delete("/freezers/:id", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const params = parse(entityIdParamsSchema, request.params, reply);
    if (!params) return;
    return mutation(reply, () => options.repository!.deleteFreezer(workspace.id, params.id));
  });

  app.post("/freezers/:freezerId/racks", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const params = parse(freezerIdParamsSchema, request.params, reply);
    if (!params) return;
    const input = parse(createRackSchema, request.body, reply);
    if (!input) return;
    return mutation(reply, () => options.repository!.createRack(workspace.id, params.freezerId, input));
  });

  app.patch("/racks/:id", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const params = parse(entityIdParamsSchema, request.params, reply);
    if (!params) return;
    const input = parse(updateRackSchema, request.body, reply);
    if (!input) return;
    return mutation(reply, () => options.repository!.updateRack(workspace.id, params.id, input));
  });

  app.delete("/racks/:id", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const params = parse(entityIdParamsSchema, request.params, reply);
    if (!params) return;
    return mutation(reply, () => options.repository!.deleteRack(workspace.id, params.id));
  });

  app.post("/racks/:rackId/boxes", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const params = parse(rackIdParamsSchema, request.params, reply);
    if (!params) return;
    const input = parse(createBoxSchema, request.body, reply);
    if (!input) return;
    return mutation(reply, () => options.repository!.createBox(workspace.id, params.rackId, input));
  });

  app.patch("/boxes/:id", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const params = parse(entityIdParamsSchema, request.params, reply);
    if (!params) return;
    const input = parse(updateBoxSchema, request.body, reply);
    if (!input) return;
    return mutation(reply, () => options.repository!.updateBox(workspace.id, params.id, input));
  });

  app.delete("/boxes/:id", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const params = parse(entityIdParamsSchema, request.params, reply);
    if (!params) return;
    return mutation(reply, () => options.repository!.deleteBox(workspace.id, params.id));
  });

  app.post("/boxes/:boxId/samples", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const params = parse(boxIdParamsSchema, request.params, reply);
    if (!params) return;
    const input = parse(createSampleSchema, request.body, reply);
    if (!input) return;
    return mutation(reply, () => options.repository!.createSample(workspace.id, params.boxId, input));
  });

  app.patch("/samples/:id", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const params = parse(entityIdParamsSchema, request.params, reply);
    if (!params) return;
    const input = parse(updateSampleSchema, request.body, reply);
    if (!input) return;
    return mutation(reply, () => options.repository!.updateSample(workspace.id, params.id, input));
  });

  app.post("/samples/:id/move", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const params = parse(entityIdParamsSchema, request.params, reply);
    if (!params) return;
    const input = parse(moveSampleSchema, request.body, reply);
    if (!input) return;
    return mutation(reply, () => options.repository!.moveSample(workspace.id, params.id, input));
  });

  app.delete("/samples/:id", async (request, reply) => {
    if (!options.repository || !options.authService) return unavailable(reply);
    const workspace = await workspaceFor(request, reply, options.authService);
    if (!workspace) return;
    const params = parse(entityIdParamsSchema, request.params, reply);
    if (!params) return;
    return mutation(reply, () => options.repository!.deleteSample(workspace.id, params.id));
  });
};
