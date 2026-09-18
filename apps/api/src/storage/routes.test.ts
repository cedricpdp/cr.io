import { afterEach, describe, expect, it } from "vitest";
import type {
  CreateBox,
  CreateFreezer,
  CreateRack,
  StorageSnapshot,
  UpdateBox,
  UpdateFreezer,
  UpdateRack
} from "../../../../packages/contracts/src/index.js";
import { MemoryAuthRepository } from "../../test/memory-auth.js";
import { buildApp } from "../app.js";
import { AuthService } from "../auth/service.js";
import { StorageConflictError } from "./errors.js";
import type { StorageRepository } from "./repository.js";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";
const FREEZER_ID = "00000000-0000-4000-8000-000000000010";
const RACK_ID = "00000000-0000-4000-8000-000000000020";
const BOX_ID = "00000000-0000-4000-8000-000000000030";

class MemoryStorageRepository implements StorageRepository {
  readonly workspaceCalls: string[] = [];
  conflict = false;

  async getSnapshot(workspaceId: string, workspaceName: string): Promise<StorageSnapshot> {
    this.workspaceCalls.push(workspaceId);
    return { workspace: { id: workspaceId, name: workspaceName }, freezers: [] };
  }

  async createFreezer(workspaceId: string, _input: CreateFreezer) {
    this.record(workspaceId);
    return FREEZER_ID;
  }

  async updateFreezer(workspaceId: string, _id: string, _input: UpdateFreezer) {
    this.record(workspaceId);
    return true;
  }

  async deleteFreezer(workspaceId: string, _id: string) {
    this.record(workspaceId);
    return true;
  }

  async createRack(workspaceId: string, _freezerId: string, _input: CreateRack) {
    this.record(workspaceId);
    return RACK_ID;
  }

  async updateRack(workspaceId: string, _id: string, _input: UpdateRack) {
    this.record(workspaceId);
    return true;
  }

  async deleteRack(workspaceId: string, _id: string) {
    this.record(workspaceId);
    return true;
  }

  async createBox(workspaceId: string, _rackId: string, _input: CreateBox) {
    this.record(workspaceId);
    return BOX_ID;
  }

  async updateBox(workspaceId: string, _id: string, _input: UpdateBox) {
    this.record(workspaceId);
    return true;
  }

  async deleteBox(workspaceId: string, _id: string) {
    this.record(workspaceId);
    return true;
  }

  private record(workspaceId: string) {
    if (this.conflict) throw new StorageConflictError();
    this.workspaceCalls.push(workspaceId);
  }
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function authenticatedApp(repository = new MemoryStorageRepository()) {
  const authService = new AuthService(new MemoryAuthRepository());
  const registration = await authService.register({
    email: "cedric@example.com",
    password: "a long password 2026",
    displayName: "Cédric",
    workspaceName: "Cryo Lab"
  });
  const app = await buildApp({ serveWeb: false, authService, storageRepository: repository });
  apps.push(app);
  return { app, repository, cookie: `crio_session=${registration.token}` };
}

describe("workspace storage routes", () => {
  it("requires a session and scopes snapshots to its workspace", async () => {
    const { app, repository, cookie } = await authenticatedApp();
    expect((await app.inject({ method: "GET", url: "/api/storage" })).statusCode).toBe(401);

    const response = await app.inject({ method: "GET", url: "/api/storage", headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().workspace.id).toBe(WORKSPACE_ID);
    expect(repository.workspaceCalls).toEqual([WORKSPACE_ID]);
  });

  it("creates, updates and deletes every hierarchy level inside the session workspace", async () => {
    const { app, repository, cookie } = await authenticatedApp();
    const requests = [
      { method: "POST", url: "/api/freezers", payload: { name: "Freezer −80 °C", temperatureCelsius: -80 }, status: 201 },
      { method: "PATCH", url: `/api/freezers/${FREEZER_ID}`, payload: { name: "Freezer principal" }, status: 204 },
      { method: "POST", url: `/api/freezers/${FREEZER_ID}/racks`, payload: { name: "Rack A" }, status: 201 },
      { method: "PATCH", url: `/api/racks/${RACK_ID}`, payload: { position: 2 }, status: 204 },
      { method: "POST", url: `/api/racks/${RACK_ID}/boxes`, payload: { name: "Box 01", rows: 8, columns: 8 }, status: 201 },
      { method: "PATCH", url: `/api/boxes/${BOX_ID}`, payload: { name: "Box principale" }, status: 204 },
      { method: "DELETE", url: `/api/boxes/${BOX_ID}`, status: 204 },
      { method: "DELETE", url: `/api/racks/${RACK_ID}`, status: 204 },
      { method: "DELETE", url: `/api/freezers/${FREEZER_ID}`, status: 204 }
    ] as const;

    for (const request of requests) {
      const response = await app.inject({ ...request, headers: { cookie } });
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(request.status);
    }
    expect(repository.workspaceCalls).toEqual(Array.from({ length: requests.length }, () => WORKSPACE_ID));
  });

  it("validates identifiers and reports uniqueness conflicts", async () => {
    const { app, repository, cookie } = await authenticatedApp();
    expect((await app.inject({ method: "DELETE", url: "/api/freezers/not-a-uuid", headers: { cookie } })).statusCode).toBe(400);
    repository.conflict = true;
    const conflict = await app.inject({ method: "POST", url: "/api/freezers", headers: { cookie }, payload: { name: "Duplicate", temperatureCelsius: -80 } });
    expect(conflict.statusCode).toBe(409);
  });
});
