import type { FastifyInstance } from "fastify";

import { DecisionSnapshotSchema } from "../../shared/roommate-schemas";
import { AppError } from "../errors";
import type { ZenClient } from "../providers/zen";
import { decideRoommateAction } from "../services/roommate-decision";

export function registerRoommateRoute(app: FastifyInstance, client: ZenClient): void {
  app.post("/api/roommate/decision", async (request, reply) => {
    const snapshot = DecisionSnapshotSchema.safeParse(request.body);
    if (!snapshot.success) throw new AppError("INVALID_INPUT", "室友判断请求格式无效", false);
    return reply.send(await decideRoommateAction(snapshot.data, client));
  });
}
