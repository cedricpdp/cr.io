import { verify } from "argon2";
import { afterEach, describe, expect, it } from "vitest";
import type { AuthSession } from "../../../../packages/contracts/src/index.js";
import { buildApp } from "../app.js";
import {
  AuthService,
  DuplicateEmailError,
  type AuthAccount,
  type AuthRepository
} from "./service.js";

class MemoryAuthRepository implements AuthRepository {
  account?: AuthAccount;
  authSession?: AuthSession;
  readonly sessions = new Map<string, { userId: string; expiresAt: Date }>();

  async findAccountByEmail(email: string) {
    return this.account?.email === email ? this.account : undefined;
  }

  async createAccount(input: { email: string; displayName: string; passwordHash: string; workspaceName: string }) {
    if (this.account) throw new DuplicateEmailError();
    this.account = { id: "user-1", email: input.email, displayName: input.displayName, passwordHash: input.passwordHash };
    this.authSession = {
      user: { id: "user-1", email: input.email, displayName: input.displayName },
      workspace: { id: "workspace-1", name: input.workspaceName, role: "owner" }
    };
    return this.authSession;
  }

  async findSessionForUser(userId: string) {
    return userId === this.account?.id ? this.authSession : undefined;
  }

  async createSession(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    this.sessions.set(input.tokenHash, { userId: input.userId, expiresAt: input.expiresAt });
  }

  async findSession(tokenHash: string, now: Date) {
    const session = this.sessions.get(tokenHash);
    return session && session.expiresAt > now ? this.authSession : undefined;
  }

  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("authentication routes", () => {
  it("registers an owner with an Argon2id password and creates a secure session", async () => {
    const repository = new MemoryAuthRepository();
    const app = await buildApp({ serveWeb: false, authService: new AuthService(repository) });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: " Cedric@Example.com ",
        password: "a long password 2026",
        displayName: "Cédric",
        workspaceName: "Cryo Lab"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().workspace.role).toBe("owner");
    expect(repository.account?.email).toBe("cedric@example.com");
    expect(repository.account?.passwordHash).not.toContain("a long password 2026");
    expect(await verify(repository.account?.passwordHash ?? "", "a long password 2026")).toBe(true);
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("SameSite=Lax");
  });

  it("restores the session, protects storage, then invalidates the session on logout", async () => {
    const repository = new MemoryAuthRepository();
    const app = await buildApp({ serveWeb: false, authService: new AuthService(repository) });
    apps.push(app);

    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "cedric@example.com", password: "a long password 2026", displayName: "Cédric", workspaceName: "Cryo Lab" }
    });
    const setCookie = register.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0];

    expect((await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/storage", headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/storage" })).statusCode).toBe(401);
  });

  it("rejects invalid credentials without revealing whether the account exists", async () => {
    const repository = new MemoryAuthRepository();
    const service = new AuthService(repository);
    const app = await buildApp({ serveWeb: false, authService: service });
    apps.push(app);
    await service.register({ email: "cedric@example.com", password: "a long password 2026", displayName: "Cédric", workspaceName: "Cryo Lab" });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "cedric@example.com", password: "not the password" }
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("invalid_credentials");
  });
});
