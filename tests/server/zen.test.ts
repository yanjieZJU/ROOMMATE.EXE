import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../src/server/config";
import { AppError } from "../../src/server/errors";
import { createZenClient, type SystemOneRequest } from "../../src/server/providers/zen";

const fixture = JSON.parse(
  await readFile(fileURLToPath(new URL("../fixtures/zen-choice.json", import.meta.url)), "utf8"),
);

const request: SystemOneRequest = {
  state: { language: "zh-CN", situation: "主角站在岔路口" },
  questions: {
    action: {
      type: "choice",
      instructions: "主角最可能做什么？",
      criteria: { action_1: "向左", action_2: "等待", action_3: "向右" },
    },
  },
};

const config = (key = "open-secret") => loadConfig({ OPENCODE_API_KEY: key });
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("OpenCode Zen adapter", () => {
  it("pins the free endpoint/model, authenticates, and parses a valid Choice", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return response(fixture);
    }) as typeof fetch;

    const result = await createZenClient(config(), fetchImpl).evaluate(request, { idempotencyKey: "session/1/0/hash" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://opencode.ai/zen/v1/systemone");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: "Bearer open-secret", "Idempotency-Key": "session/1/0/hash" });
    expect(JSON.parse(String(calls[0]?.init.body)).model).toBe("jev-1.13-free");
    expect(result.answers.action?.choice).toBe("action_2");
  });

  it("normalizes a non-unit probability total", async () => {
    const payload = { ...fixture, answers: { action: { ...fixture.answers.action, probabilities: { action_1: 0.2, action_2: 0.2, action_3: 0.2 } } } };
    const client = createZenClient(config(), vi.fn(async () => response(payload)) as typeof fetch);

    await expect(client.evaluate(request)).resolves.toMatchObject({ answers: { action: { probabilities: { action_1: 1 / 3, action_2: 1 / 3, action_3: 1 / 3 } } } });
  });

  it("rejects an invalid answer type as PROVIDER_INVALID_RESPONSE", async () => {
    const payload = { ...fixture, answers: { action: { ...fixture.answers.action, type: "score" } } };
    const client = createZenClient(config(), vi.fn(async () => response(payload)) as typeof fetch);
    await expect(client.evaluate(request)).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE", retryable: false });
  });

  it.each([401, 422])("does not retry HTTP %i", async (status) => {
    const fetchImpl = vi.fn(async () => response({ error: "open-secret legacy-secret" }, status)) as typeof fetch;
    const client = createZenClient(config(), fetchImpl);

    const error = await client.evaluate(request).catch((caught: unknown) => caught) as AppError;

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(error.code).toBe(status === 422 ? "PROVIDER_INVALID_RESPONSE" : "PROVIDER_UNAVAILABLE");
    expect(error.retryable).toBe(false);
    expect(JSON.stringify(error)).not.toContain("open-secret");
    expect(JSON.stringify(error)).not.toContain("legacy-secret");
  });

  it.each([429, 529])("retries HTTP %i twice without changing model", async (status) => {
    const models: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      models.push(JSON.parse(String(init?.body)).model);
      return response({ error: "busy" }, status, { "retry-after": "0" });
    }) as typeof fetch;

    const error = await createZenClient(config(), fetchImpl).evaluate(request).catch((caught: unknown) => caught) as AppError;

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(models).toEqual(["jev-1.13-free", "jev-1.13-free", "jev-1.13-free"]);
    expect(error).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: true });
  });

  it("retries a timeout twice and returns only a sanitized stable error", async () => {
    const fetchImpl = vi.fn(async () => { throw new DOMException("open-secret", "TimeoutError"); }) as typeof fetch;
    const error = await createZenClient(config(), fetchImpl).evaluate(request).catch((caught: unknown) => caught) as AppError;

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(error).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: true });
    expect(JSON.stringify(error)).not.toContain("open-secret");
    expect(JSON.stringify(error)).not.toContain("TimeoutError");
  });
});
