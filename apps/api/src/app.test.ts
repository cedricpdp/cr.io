import { afterEach, describe, expect, it } from "vitest";
import { healthSchema, storageSnapshotSchema } from "../../../packages/contracts/src/index.js";
import { buildApp } from "./app.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("cr.io API", () => {
  it("exposes a liveness check that does not depend on PostgreSQL", async () => {
    const app = await buildApp({ serveWeb: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/live" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "0.7.1" });
  });

  it("reports a healthy API without requiring a local database", async () => {
    const app = await buildApp({ serveWeb: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(healthSchema.parse(response.json()).database).toBe("not_configured");
  });

  it("returns a storage snapshot matching the shared contract", async () => {
    const app = await buildApp({ serveWeb: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/storage" });
    expect(storageSnapshotSchema.parse(response.json()).freezers).toHaveLength(1);
  });
});
