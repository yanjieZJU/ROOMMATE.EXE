import type { DecisionSnapshot, RoommateDecision } from "../../shared/roommate-schemas";

export interface ApiClient {
  decideRoommate(snapshot: DecisionSnapshot): Promise<RoommateDecision>;
}

const INSTALLATION_KEY = "roommate-exe:installation-id";

function installationId(): string {
  const existing = localStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const created = `roommate-${crypto.randomUUID()}`;
  localStorage.setItem(INSTALLATION_KEY, created);
  return created;
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-installation-id", installationId());
  const response = await fetch(url, { ...init, headers });
  const body = await response.json().catch(() => ({ error: { message: "服务返回了无法读取的结果", retryable: false } }));
  if (!response.ok) throw body;
  return body as T;
}

const post = <T>(url: string, payload: unknown) => requestJson<T>(url, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
});

export function createHttpApiClient(): ApiClient {
  return {
    decideRoommate: (snapshot) => post("/api/roommate/decision", snapshot),
  };
}
