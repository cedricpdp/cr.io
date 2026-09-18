import type { AuthSession } from "../../../packages/contracts/src/index.js";
import {
  DuplicateEmailError,
  type AuthAccount,
  type AuthRepository
} from "../src/auth/service.js";

export class MemoryAuthRepository implements AuthRepository {
  account?: AuthAccount;
  authSession?: AuthSession;
  readonly sessions = new Map<string, { userId: string; expiresAt: Date }>();

  async findAccountByEmail(email: string) {
    return this.account?.email === email ? this.account : undefined;
  }

  async createAccount(input: { email: string; displayName: string; passwordHash: string; workspaceName: string }) {
    if (this.account) throw new DuplicateEmailError();
    this.account = { id: "00000000-0000-4000-8000-000000000001", email: input.email, displayName: input.displayName, passwordHash: input.passwordHash };
    this.authSession = {
      user: { id: this.account.id, email: input.email, displayName: input.displayName },
      workspace: { id: "00000000-0000-4000-8000-000000000002", name: input.workspaceName, role: "owner" }
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
