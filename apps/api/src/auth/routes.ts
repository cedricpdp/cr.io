import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { ZodError } from "zod";
import {
  loginRequestSchema,
  registerRequestSchema
} from "../../../../packages/contracts/src/index.js";
import { DuplicateEmailError, InvalidCredentialsError } from "./service.js";
import type { AuthService } from "./service.js";

export const SESSION_COOKIE = "crio_session";

const cookieOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60
};

function unavailable(reply: FastifyReply) {
  return reply.code(503).send({ error: "database_unavailable", message: "La base de données n’est pas configurée." });
}

function validationError(reply: FastifyReply, error: ZodError) {
  return reply.code(400).send({
    error: "validation_error",
    message: error.issues[0]?.message ?? "Données invalides."
  });
}

export interface AuthRoutesOptions {
  service?: AuthService;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, options) => {
  app.post("/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!options.service) return unavailable(reply);
    try {
      const input = registerRequestSchema.parse(request.body);
      const result = await options.service.register(input);
      return reply
        .setCookie(SESSION_COOKIE, result.token, { ...cookieOptions, expires: result.expiresAt })
        .code(201)
        .send(result.authSession);
    } catch (error) {
      if (error instanceof ZodError) return validationError(reply, error);
      if (error instanceof DuplicateEmailError) return reply.code(409).send({ error: "email_taken", message: "Cette adresse e-mail est déjà utilisée." });
      throw error;
    }
  });

  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!options.service) return unavailable(reply);
    try {
      const input = loginRequestSchema.parse(request.body);
      const result = await options.service.login(input);
      return reply
        .setCookie(SESSION_COOKIE, result.token, { ...cookieOptions, expires: result.expiresAt })
        .send(result.authSession);
    } catch (error) {
      if (error instanceof ZodError) return validationError(reply, error);
      if (error instanceof InvalidCredentialsError) return reply.code(401).send({ error: "invalid_credentials", message: "E-mail ou mot de passe incorrect." });
      throw error;
    }
  });

  app.get("/session", async (request, reply) => {
    if (!options.service) return unavailable(reply);
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await options.service.authenticate(token) : undefined;
    if (!session) return reply.code(401).send({ error: "unauthorized", message: "Connexion requise." });
    return session;
  });

  app.post("/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token && options.service) await options.service.logout(token);
    return reply.clearCookie(SESSION_COOKIE, { path: "/" }).code(204).send();
  });
};
