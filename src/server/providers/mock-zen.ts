import type { SystemOneRequest, SystemOneResponse, ZenClient } from "./zen";

export class MockZenClient implements ZenClient {
  constructor(private readonly delayMs = 0) {}
  async evaluate(request: SystemOneRequest): Promise<SystemOneResponse> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return {
      model: "jev-1.13-free",
      answers: Object.fromEntries(Object.entries(request.questions).map(([key, question]) => {
        const labels = Object.keys(question.criteria);
        const remainder = labels.length > 1 ? 0.4 / (labels.length - 1) : 0;
        const probabilities = Object.fromEntries(labels.map((label, index) => [label, index === 0 ? 0.6 : remainder]));
        return [key, { type: "choice" as const, choice: labels[0]!, probabilities, confidence: 0.6 }];
      })),
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }
}
