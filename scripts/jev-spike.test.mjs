import assert from "node:assert/strict";
import test from "node:test";

import { FREE_MODEL, ZEN_URL, buildScenario, runProbe, runTier } from "./jev-spike.mjs";

function completeResponse(request) {
  const [questionId, question] = Object.entries(request.questions)[0];
  const labels = Object.keys(question.criteria);
  const probability = 1 / labels.length;
  return new Response(JSON.stringify({
    model: FREE_MODEL,
    answers: {
      [questionId]: {
        type: "choice",
        choice: labels[0],
        probabilities: Object.fromEntries(labels.map((label) => [label, probability])),
        confidence: probability,
      },
    },
    usage: { input_tokens: 12, output_tokens: 34, total_tokens: 46 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("buildScenario creates one Chinese Choice with exact 3, 7, and 2 candidate sets", () => {
  for (const [kind, count] of [["action", 3], ["action", 7], ["lease", 2]]) {
    const request = buildScenario({ kind, candidateCount: count });
    assert.equal(Object.keys(request.questions).length, 1);
    assert.equal(Object.keys(request.questions.roommateDecision.criteria).length, count);
    assert.equal(request.questions.roommateDecision.type, "choice");
    assert.match(JSON.stringify(request), /[\u3400-\u9fff]/u);
    assert.equal(request.model, FREE_MODEL);
  }
});

test("runTier calls only free Zen with stable idempotency and returns redacted metrics", async () => {
  const requests = [];
  const apiKey = "secret-that-must-never-escape";
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return completeResponse(JSON.parse(init.body));
  };

  const result = await runTier({ kind: "action", candidateCount: 7, apiKey, fetchImpl });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, ZEN_URL);
  assert.equal(JSON.parse(requests[0].init.body).model, FREE_MODEL);
  assert.match(requests[0].init.headers["Idempotency-Key"], /^roommate-spike\//);
  assert.equal(result.ok, true);
  assert.equal(result.answerCount, 1);
  assert.equal(result.candidateCount, 7);
  assert.equal(result.retryCount, 0);
  assert.equal(JSON.stringify(result).includes(apiKey), false);
  assert.equal(JSON.stringify(result).includes("Authorization"), false);
});

test("runTier retries one retryable failure with the same idempotency key", async () => {
  const keys = [];
  let call = 0;
  const fetchImpl = async (_url, init) => {
    keys.push(init.headers["Idempotency-Key"]);
    call += 1;
    return call === 1 ? new Response("", { status: 529 }) : completeResponse(JSON.parse(init.body));
  };

  const result = await runTier({ kind: "lease", candidateCount: 2, apiKey: "private", fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(result.retryCount, 1);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});

test("runProbe runs action-3, action-7, lease-2 and never falls back to paid Jev", async () => {
  const models = [];
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(init.body);
    models.push(request.model);
    return completeResponse(request);
  };

  const result = await runProbe({ apiKey: "private", fetchImpl });

  assert.deepEqual(result.tiers.map((tier) => [tier.kind, tier.candidateCount]), [
    ["action", 3],
    ["action", 7],
    ["lease", 2],
  ]);
  assert.deepEqual(models, [FREE_MODEL, FREE_MODEL, FREE_MODEL]);
  assert.equal(JSON.stringify(result).includes('jev-1.13"'), false);
});

test("runTier rejects incomplete probabilities and sanitizes provider errors", async () => {
  const invalid = async (_url, init) => {
    const request = JSON.parse(init.body);
    const response = completeResponse(request);
    const payload = await response.json();
    payload.answers.roommateDecision.probabilities = { missing: 1 };
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  const result = await runTier({ kind: "action", candidateCount: 3, apiKey: "never-log-this-key", fetchImpl: invalid });

  assert.equal(result.ok, false);
  assert.match(result.error, /结构/);
  assert.equal(JSON.stringify(result).includes("never-log-this-key"), false);
});
