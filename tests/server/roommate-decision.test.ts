import { describe, expect, it, vi } from "vitest";

import { resolveAffordances } from "../../src/game/actions/affordance-resolver";
import { buildDecisionSnapshot } from "../../src/game/jev/decision-snapshot";
import { createApp } from "../../src/server/app";
import { loadConfig } from "../../src/server/config";
import { AppError } from "../../src/server/errors";
import { createZenClient, type SystemOneRequest, type SystemOneResponse, type ZenClient } from "../../src/server/providers/zen";
import { decideRoommateAction } from "../../src/server/services/roommate-decision";
import type { DecisionSnapshot } from "../../src/shared/roommate-schemas";
import { createRoommateFixture } from "../fixtures/roommate";

async function snapshot(): Promise<DecisionSnapshot> {
  const world = createRoommateFixture().world;
  return buildDecisionSnapshot(world, resolveAffordances(world, "jev"));
}

function responseFor(input: DecisionSnapshot, overrides: Partial<SystemOneResponse> = {}): SystemOneResponse {
  const probabilities = Object.fromEntries(input.candidates.map((candidate, index) => [candidate.id, index === 0 ? 0.6 : 0.4 / (input.candidates.length - 1)]));
  return {
    model: "jev-1.13-free",
    answers: {
      roommateAction: {
        type: "choice",
        choice: input.candidates[0]!.id,
        probabilities,
        confidence: 0.6,
      },
    },
    usage: { input_tokens: 90, output_tokens: 18 },
    ...overrides,
  };
}

describe("roommate decision service", () => {
  it("repairs one invalid response with the same snapshot and a derived idempotency key", async () => {
    const input = await snapshot();
    const options: Array<{ idempotencyKey?: string }> = [];
    const client: ZenClient = {
      evaluate: vi.fn(async (_request, callOptions) => {
        options.push(callOptions ?? {});
        if (options.length === 1) throw new AppError("PROVIDER_INVALID_RESPONSE", "Jev 返回了无法识别的结果", false);
        return responseFor(input);
      }),
    };

    await expect(decideRoommateAction(input, client)).resolves.toMatchObject({ selectedActionId: input.candidates[0]!.id });
    const base = `roommate/${input.decisionPointId}/${input.stateHash}`;
    expect(options.map((option) => option.idempotencyKey)).toEqual([base, `${base}/repair`]);
  });

  it("sends one Chinese Choice with exactly the legal action ids and known costs", async () => {
    const input = await snapshot();
    let captured: SystemOneRequest | undefined;
    let capturedOptions: { idempotencyKey?: string; maxAttempts?: number } | undefined;
    const client: ZenClient = {
      evaluate: vi.fn(async (request, options) => {
        captured = request;
        capturedOptions = options;
        return responseFor(input);
      }),
    };

    const decision = await decideRoommateAction(input, client);

    expect(Object.keys(captured!.questions)).toEqual(["roommateAction"]);
    expect(Object.keys(captured!.questions.roommateAction!.criteria)).toEqual(input.candidates.map((candidate) => candidate.id));
    expect(JSON.stringify(captured)).toContain("已知代价");
    expect(JSON.stringify(captured)).not.toMatch(/hunger|energy|stress|mood|focus|relationship|renewal|effects|factTemplates/);
    expect(capturedOptions).toEqual({ idempotencyKey: `roommate/${input.decisionPointId}/${input.stateHash}`, maxAttempts: 2 });
    expect(decision).toMatchObject({ selectedActionId: input.candidates[0]!.id, stateHash: input.stateHash, model: "jev-1.13-free" });
  });

  it("rejects a mismatched state hash before calling Jev", async () => {
    const input = await snapshot();
    input.observableState[0] = "状态已经改变";
    const client: ZenClient = { evaluate: vi.fn() };

    await expect(decideRoommateAction(input, client)).rejects.toMatchObject({ code: "SESSION_CONFLICT" });
    expect(client.evaluate).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown action", (input: DecisionSnapshot) => responseFor(input, { answers: { roommateAction: { type: "choice", choice: "invented", probabilities: { invented: 1 }, confidence: 1 } } })],
    ["paid model", (input: DecisionSnapshot) => responseFor(input, { model: "jev-1.13-pro" })],
  ])("rejects a provider response with %s", async (_label, makeResponse) => {
    const input = await snapshot();
    const client: ZenClient = { evaluate: vi.fn(async () => makeResponse(input)) };

    await expect(decideRoommateAction(input, client)).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });

  it("registers the validated roommate decision route", async () => {
    const input = await snapshot();
    const client: ZenClient = { evaluate: vi.fn(async () => responseFor(input)) };
    const app = createApp({ config: loadConfig({ OPENCODE_API_KEY: "server-secret" }), zenClient: client });

    const response = await app.inject({ method: "POST", url: "/api/roommate/decision", payload: input });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ selectedActionId: input.candidates[0]!.id, model: "jev-1.13-free" });
    expect(response.body).not.toContain("server-secret");
  });
});

describe("roommate retry contract", () => {
  const request: SystemOneRequest = {
    state: { 语言: "中文" },
    questions: { roommateAction: { type: "choice", instructions: "选择动作", criteria: { wait: "等待", look: "观察", rest: "休息" } } },
  };

  it("uses exactly two retryable attempts with one idempotency key", async () => {
    const keys: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      keys.push(String((init?.headers as Record<string, string>)["Idempotency-Key"]));
      return new Response("{}", { status: 429, headers: { "retry-after": "0" } });
    }) as typeof fetch;
    const client = createZenClient(loadConfig({ OPENCODE_API_KEY: "retry-secret" }), fetchImpl);

    await expect(client.evaluate(request, { idempotencyKey: "same-key", maxAttempts: 2 })).rejects.toMatchObject({ retryable: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(keys).toEqual(["same-key", "same-key"]);
  });

  it("does not retry a non-retryable provider response", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 401 })) as typeof fetch;
    const client = createZenClient(loadConfig({ OPENCODE_API_KEY: "retry-secret" }), fetchImpl);

    await expect(client.evaluate(request, { maxAttempts: 2 })).rejects.toBeInstanceOf(AppError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
