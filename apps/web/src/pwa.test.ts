import { describe, expect, it } from "vitest";
import { isStaticDemoHost, serviceWorkerUrl } from "./pwa.js";

describe("PWA helpers", () => {
  it("builds the service-worker URL for root hosting", () => {
    expect(serviceWorkerUrl("/")).toBe("/sw.js");
  });

  it("keeps a subpath deployment inside its scope", () => {
    expect(serviceWorkerUrl("/cr.io/")).toBe("/cr.io/sw.js");
    expect(serviceWorkerUrl("/cr.io")).toBe("/cr.io/sw.js");
  });

  it("limits automatic demo fallback to GitHub Pages", () => {
    expect(isStaticDemoHost("cedricpdp.github.io")).toBe(true);
    expect(isStaticDemoHost("crio.example.org")).toBe(false);
  });
});
