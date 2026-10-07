import { z } from "zod";

export const UsageSchema = z.object({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  total_tokens: z.number().int().nonnegative().optional(),
}).passthrough();

export const ChoiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string().min(1),
  probabilities: z.record(z.string(), z.number().min(0).max(1)).default({}).refine(
    (probabilities) => Object.keys(probabilities).length === 0 || Math.abs(Object.values(probabilities).reduce((sum, value) => sum + value, 0) - 1) <= 1e-6,
    "Choice 概率总和必须为 1",
  ),
  confidence: z.number().min(0).max(1).nullable().default(null),
}).refine((answer) => Object.keys(answer.probabilities).length === 0 || Object.hasOwn(answer.probabilities, answer.choice), "Choice 结果必须存在于概率表中");

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "INVALID_INPUT",
      "CONTENT_BLOCKED",
      "QUOTA_EXCEEDED",
      "BUDGET_EXCEEDED",
      "PROVIDER_UNAVAILABLE",
      "PROVIDER_INVALID_RESPONSE",
      "SESSION_CONFLICT",
    ]),
    message: z.string(),
    retryable: z.boolean(),
    retryAfterSeconds: z.number().nonnegative().optional(),
  }),
});

export type Usage = z.infer<typeof UsageSchema>;
export type ChoiceAnswer = z.infer<typeof ChoiceAnswerSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
