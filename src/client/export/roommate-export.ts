import { RoommateSessionSchema, type RoommateSession } from "../../shared/roommate-schemas";

export function exportRoommateSession(session: RoommateSession): string {
  const privacySafe = RoommateSessionSchema.parse(session);
  return JSON.stringify(privacySafe, null, 2);
}
