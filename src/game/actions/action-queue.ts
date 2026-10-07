import type { QueuedAction } from "../../shared/roommate-schemas";

export const PLAYER_QUEUE_CAPACITY = 3;

export function enqueue(queue: readonly QueuedAction[], entry: QueuedAction): QueuedAction[] {
  if (queue.length >= PLAYER_QUEUE_CAPACITY) throw new RangeError("玩家动作队列最多包含三个动作");
  if (queue.some((candidate) => candidate.queueId === entry.queueId)) throw new RangeError("动作队列 id 必须唯一");
  return [...queue, structuredClone(entry)];
}

export function cancel(queue: readonly QueuedAction[], queueId: string): QueuedAction[] {
  return queue.filter((entry) => entry.queueId !== queueId).map((entry) => structuredClone(entry));
}

export function reorder(queue: readonly QueuedAction[], queueId: string, toIndex: number): QueuedAction[] {
  const fromIndex = queue.findIndex((entry) => entry.queueId === queueId);
  if (fromIndex < 0) return queue.map((entry) => structuredClone(entry));
  const boundedIndex = Math.max(0, Math.min(queue.length - 1, toIndex));
  const next = queue.map((entry) => structuredClone(entry));
  const [entry] = next.splice(fromIndex, 1);
  next.splice(boundedIndex, 0, entry!);
  return next;
}
