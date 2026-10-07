import { describe, expect, it } from "vitest";

import { normalizeZenResponse, ZenResponseError } from "../../src/server/providers/zen-response-adapter";
import type { SystemOneRequest } from "../../src/server/providers/zen";

const request: SystemOneRequest = {
  state: { 语言: "中文" },
  questions: {
    action: {
      type: "choice",
      instructions: "选择下一步",
      criteria: { wait: "等待", rest: "休息", work: "工作" },
    },
  },
};

function payload(choice: unknown = "rest") {
  return {
    model: "jev-1.13-free",
    answers: {
      action: {
        type: "choice",
        choice,
        probabilities: { wait: 0.2, rest: 0.6, work: 0.2, invented: 9 },
        confidence: 0.6,
      },
    },
    usage: { input_tokens: 10, output_tokens: 2 },
  };
}

describe("Jev response normalization", () => {
  it.each([
    ["object", payload(), "rest"],
    ["JSON string", JSON.stringify(payload()), "rest"],
    ["fenced JSON", `\`\`\`json\n${JSON.stringify(payload())}\n\`\`\``, "rest"],
    ["exact label", payload("休息"), "rest"],
    ["one-based index", payload(2), "rest"],
  ])("normalizes a valid %s choice", (_label, input, expected) => {
    const result = normalizeZenResponse(input, request);

    expect(result.answers.action?.choice).toBe(expected);
    expect(result.answers.action?.probabilities).toEqual({ wait: 0.2, rest: 0.6, work: 0.2 });
  });

  it("accepts an unambiguous choice without optional probabilities or confidence", () => {
    const input = payload();
    input.answers.action = { type: "choice", choice: "work" } as typeof input.answers.action;

    const result = normalizeZenResponse(input, request);

    expect(result.answers.action).toMatchObject({ choice: "work", probabilities: {}, confidence: null });
  });

  it.each([
    ["ambiguous label", { ...request, questions: { action: { ...request.questions.action!, criteria: { wait: "相同", rest: "相同", work: "工作" } } } }, payload("相同")],
    ["unknown choice", request, payload("invented")],
    ["malformed JSON", request, "```json\nnot-json\n```"],
    ["wrong model", request, { ...payload(), model: "jev-1.13-pro" }],
    ["incomplete answer keys", request, { ...payload(), answers: {} }],
  ])("rejects %s with a sanitized reason", (_label, inputRequest, input) => {
    const error = (() => {
      try { normalizeZenResponse(input, inputRequest as SystemOneRequest); }
      catch (caught) { return caught; }
      return undefined;
    })();

    expect(error).toBeInstanceOf(ZenResponseError);
    expect(JSON.stringify(error)).not.toContain("invented");
    expect(JSON.stringify(error)).not.toContain("not-json");
    expect(JSON.stringify(error)).not.toContain("jev-1.13-pro");
  });
});
