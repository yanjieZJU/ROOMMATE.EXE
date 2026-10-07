import { createInitialRoommateSession } from "../../src/game/simulation/initial-state";

export const ROOMMATE_FIXTURE_NOW = "2026-09-28T00:00:00.000Z";

export function createRoommateFixture() {
  return createInitialRoommateSession(ROOMMATE_FIXTURE_NOW);
}
