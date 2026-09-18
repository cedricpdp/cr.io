import { and, eq, gt } from "drizzle-orm";
import type { AuthSession } from "../../../../packages/contracts/src/index.js";
import {
  sessions,
  users,
  workspaceMembers,
  workspaces,
  type Database
} from "../../../../packages/db/src/index.js";
import { DuplicateEmailError, type AuthRepository } from "./service.js";

type DrizzleDatabase = Database["db"];

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function toAuthSession(row: {
  userId: string;
  email: string;
  displayName: string;
  workspaceId: string;
  workspaceName: string;
  role: "owner" | "admin" | "member";
}): AuthSession {
  return {
    user: { id: row.userId, email: row.email, displayName: row.displayName },
    workspace: { id: row.workspaceId, name: row.workspaceName, role: row.role }
  };
}

export class DrizzleAuthRepository implements AuthRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  async findAccountByEmail(email: string) {
    const [account] = await this.database.select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      passwordHash: users.passwordHash
    }).from(users).where(eq(users.email, email)).limit(1);
    return account;
  }

  async createAccount(input: { email: string; displayName: string; passwordHash: string; workspaceName: string }) {
    try {
      return await this.database.transaction(async (transaction) => {
        const [user] = await transaction.insert(users).values({
          email: input.email,
          displayName: input.displayName,
          passwordHash: input.passwordHash
        }).returning({ id: users.id, email: users.email, displayName: users.displayName });
        if (!user) throw new Error("User creation returned no row");

        const [workspace] = await transaction.insert(workspaces).values({ name: input.workspaceName }).returning({ id: workspaces.id, name: workspaces.name });
        if (!workspace) throw new Error("Workspace creation returned no row");

        await transaction.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: "owner" });
        return {
          user,
          workspace: { id: workspace.id, name: workspace.name, role: "owner" as const }
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateEmailError();
      throw error;
    }
  }

  async findSessionForUser(userId: string) {
    const [row] = await this.database.select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      role: workspaceMembers.role
    })
      .from(users)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(users.id, userId))
      .limit(1);
    return row ? toAuthSession(row) : undefined;
  }

  async createSession(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    await this.database.insert(sessions).values(input);
  }

  async findSession(tokenHash: string, now: Date) {
    const [row] = await this.database.select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      role: workspaceMembers.role
    })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
      .limit(1);
    return row ? toAuthSession(row) : undefined;
  }

  async deleteSession(tokenHash: string) {
    await this.database.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
}
