import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/server/app";
import { loadConfig, loadRuntimeConfig, publicConfig } from "../../src/server/config";

describe("health and secret configuration", () => {
  const apps: Array<ReturnType<typeof createApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("reports readiness without serializing provider credentials", async () => {
    const config = loadConfig({ JEV_MODEL: "jev-1.13-free" });
    const app = createApp({ config });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, configured: false, model: "jev-1.13-free", simulationDayDurationMs: 90_000 });
    expect(response.body).not.toContain("apiKey");
  });

  it("prefers OPENCODE_API_KEY and falls back to TYPESAFE_API_KEY", () => {
    const preferred = loadConfig({ OPENCODE_API_KEY: "open-key", TYPESAFE_API_KEY: "legacy-key" });
    const fallback = loadConfig({ TYPESAFE_API_KEY: "legacy-key" });

    expect(preferred.jev.apiKey).toBe("open-key");
    expect(fallback.jev.apiKey).toBe("legacy-key");
    expect(JSON.stringify(publicConfig(preferred))).not.toContain("open-key");
    expect(JSON.stringify(publicConfig(fallback))).not.toContain("legacy-key");
  });

  it("loads .env for runtime config while explicit environment variables win", () => {
    const directory = mkdtempSync(join(tmpdir(), "roommate-exe-env-"));
    const path = join(directory, ".env");
    writeFileSync(path, "OPENCODE_API_KEY=from-file\n", "utf8");
    try {
      expect(loadRuntimeConfig({}, path).jev.apiKey).toBe("from-file");
      expect(loadRuntimeConfig({ OPENCODE_API_KEY: "from-process" }, path).jev.apiKey).toBe("from-process");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
