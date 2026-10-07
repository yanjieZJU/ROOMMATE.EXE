import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHttpApiClient } from "../../src/client/api/client";

describe("HTTP API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      clear: () => values.clear(),
    });
  });

  it("sends one stable anonymous installation id with roommate decisions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const client = createHttpApiClient();

    await client.decideRoommate({} as never);
    await client.decideRoommate({} as never);

    const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    const secondHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(firstHeaders.get("x-installation-id")).toMatch(/^roommate-/);
    expect(secondHeaders.get("x-installation-id")).toBe(firstHeaders.get("x-installation-id"));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/roommate/decision");
  });
});
