import { describe, expect, it, vi } from "vitest";

import { QuotaGuard } from "../../src/server/guards/quota";
import { createQuotaStore, MemoryQuotaStore, type QuotaStore } from "../../src/server/guards/quota-store";

const context = { installationId: "install", ip: "127.0.0.1", sessionId: "session", isSessionStart: true, providerAvailable: true };

describe("QuotaGuard", () => {
  it("blocks kill switch and budget before touching counters", async () => {
    const store = new MemoryQuotaStore();
    expect(await new QuotaGuard(store, { killSwitch: true }).check(context)).toMatchObject({ allowed: false, code: "BUDGET_EXCEEDED" });
    await store.incrementWithExpiry("budget:today", 10, 86_400);
    expect(await new QuotaGuard(store, { dailyBudgetUsd: 5, dayKey: () => "today" }).check(context)).toMatchObject({ allowed: false, code: "BUDGET_EXCEEDED" });
  });

  it("enforces installation sessions, short IP rate, concurrent lock, and free-model availability", async () => {
    const store = new MemoryQuotaStore();
    const installation = new QuotaGuard(store, { installationDailySessions: 1, dayKey: () => "today" });
    expect((await installation.check(context)).allowed).toBe(true);
    expect(await installation.check({ ...context, sessionId: "second" })).toMatchObject({ allowed: false, code: "QUOTA_EXCEEDED" });

    const ip = new QuotaGuard(new MemoryQuotaStore(), { ipWindowLimit: 1 });
    expect((await ip.check({ ...context, isSessionStart: false })).allowed).toBe(true);
    expect(await ip.check({ ...context, isSessionStart: false, sessionId: "other" })).toMatchObject({ allowed: false, code: "QUOTA_EXCEEDED" });

    const lockStore = new MemoryQuotaStore();
    const lock = new QuotaGuard(lockStore, {});
    expect((await lock.check({ ...context, isSessionStart: false })).allowed).toBe(true);
    expect(await lock.check({ ...context, isSessionStart: false })).toMatchObject({ allowed: false, code: "SESSION_CONFLICT" });
    expect(await lock.check({ ...context, providerAvailable: false })).toMatchObject({ allowed: false, code: "PROVIDER_UNAVAILABLE" });
  });

  it("fails closed when the public quota store is unavailable", async () => {
    const broken: QuotaStore = {
      incrementWithExpiry: vi.fn(async () => { throw new Error("redis down"); }),
      getNumber: vi.fn(async () => { throw new Error("redis down"); }),
      acquireLock: vi.fn(async () => { throw new Error("redis down"); }),
    };
    expect(await new QuotaGuard(broken, { publicMode: true }).check(context)).toMatchObject({ allowed: false, code: "QUOTA_EXCEEDED" });
  });

  it("uses memory locally and fails closed when public Redis is not configured", async () => {
    expect(createQuotaStore({ publicMode: false })).toBeInstanceOf(MemoryQuotaStore);
    await expect(createQuotaStore({ publicMode: true }).getNumber("budget:today")).rejects.toThrow("REDIS_URL");
  });
});
