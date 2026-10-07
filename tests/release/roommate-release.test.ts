import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../src/server/app";
import { loadConfig } from "../../src/server/config";

describe("ROOMMATE.EXE release surface", () => {
  const apps: Array<ReturnType<typeof createApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("removes every legacy LIFE.EXE API", async () => {
    const app = createApp({ config: loadConfig({ JEV_MODE: "mock" }) });
    apps.push(app);

    for (const url of [
      "/api/decisions/pixels",
      "/api/events/suggest",
      "/api/aux/blueprint",
      "/api/decisions/action",
    ]) {
      const response = await app.inject({ method: "POST", url, payload: {} });
      expect(response.statusCode, url).toBe(404);
    }
  });

  it("keeps the roommate decision route and exposes only safe health data", async () => {
    const app = createApp({ config: loadConfig({ JEV_MODE: "mock", OPENCODE_API_KEY: "must-not-leak" }) });
    apps.push(app);

    const decision = await app.inject({ method: "POST", url: "/api/roommate/decision", payload: {} });
    expect(decision.statusCode).toBe(400);

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      ok: true,
      configured: true,
      model: "jev-1.13-free",
      simulationDayDurationMs: 90_000,
    });
    expect(health.body).not.toContain("must-not-leak");
    expect(health.body).not.toContain("apiKey");
  });

  it("keys public quotas by the roommate session and decision state", async () => {
    const check = vi.fn(async () => ({ allowed: true as const }));
    const app = createApp({
      config: loadConfig({ JEV_MODE: "mock", PUBLIC_MODE: "true" }),
      quotaGuard: { check } as never,
    });
    apps.push(app);

    await app.inject({
      method: "POST",
      url: "/api/roommate/decision",
      headers: { "x-installation-id": "browser-1" },
      payload: { sessionId: "session-7", decisionIndex: 0, stateHash: "a".repeat(64) },
    });

    expect(check).toHaveBeenCalledWith(expect.objectContaining({
      installationId: "browser-1",
      sessionId: `session-7:/api/roommate/decision:${"a".repeat(64)}`,
      isSessionStart: true,
    }));
  });
});
