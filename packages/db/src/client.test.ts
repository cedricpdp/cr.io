import { describe, expect, it } from "vitest";
import { normalizeDatabaseUrl } from "./client.js";

describe("database connection URL", () => {
  it("keeps SSL while removing Neon's unsupported channel-binding option", () => {
    const value = normalizeDatabaseUrl("postgresql://crio:secret@example.neon.tech/crio?sslmode=require&channel_binding=require");
    const parsed = new URL(value);

    expect(parsed.searchParams.get("sslmode")).toBe("require");
    expect(parsed.searchParams.has("channel_binding")).toBe(false);
  });
});
