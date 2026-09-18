import { createHash, randomBytes } from "node:crypto";
import { hash, verify, argon2id } from "argon2";
import type { AuthSession, LoginRequest, RegisterRequest } from "../../../../packages/contracts/src/index.js";

export interface AuthAccount {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
}

export interface AuthRepository {
  findAccountByEmail(email: string): Promise<AuthAccount | undefined>;
  createAccount(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    workspaceName: string;
  }): Promise<AuthSession>;
  findSessionForUser(userId: string): Promise<AuthSession | undefined>;
  createSession(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findSession(tokenHash: string, now: Date): Promise<AuthSession | undefined>;
  deleteSession(tokenHash: string): Promise<void>;
}

export class DuplicateEmailError extends Error {}
export class InvalidCredentialsError extends Error {}

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("en-US");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  readonly #dummyHash = hash("cr.io timing protection value", { type: argon2id });

  constructor(private readonly repository: AuthRepository) {}

  async register(input: RegisterRequest) {
    const email = normalizeEmail(input.email);
    const passwordHash = await hash(input.password, {
      type: argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1
    });

    const authSession = await this.repository.createAccount({
      email,
      passwordHash,
      displayName: input.displayName.trim(),
      workspaceName: input.workspaceName.trim()
    });

    return this.issueSession(authSession);
  }

  async login(input: LoginRequest) {
    const account = await this.repository.findAccountByEmail(normalizeEmail(input.email));
    const passwordMatches = await verify(account?.passwordHash ?? await this.#dummyHash, input.password);
    if (!account || !passwordMatches) throw new InvalidCredentialsError();

    const authSession = await this.repository.findSessionForUser?.(account.id);
    if (authSession) return this.issueSession(authSession);
    throw new InvalidCredentialsError();
  }

  async authenticate(token: string) {
    return this.repository.findSession(tokenHash(token), new Date());
  }

  async logout(token: string) {
    await this.repository.deleteSession(tokenHash(token));
  }

  private async issueSession(authSession: AuthSession) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await this.repository.createSession({ userId: authSession.user.id, tokenHash: tokenHash(token), expiresAt });
    return { authSession, token, expiresAt };
  }
}
