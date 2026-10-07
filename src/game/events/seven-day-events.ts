export interface ScheduledEvent {
  id: string;
  day: number;
  offsetMs: number;
  title: string;
  publicFact: string;
  handlingActionIds: readonly string[];
}

export const SEVEN_DAY_EVENTS: readonly ScheduledEvent[] = [
  { id: "day-1-move-in", day: 1, offsetMs: 0, title: "搬入", publicFact: "几个纸箱占据了公共储物空间", handlingActionIds: ["clean", "help"] },
  { id: "day-2-last-dinner", day: 2, offsetMs: 0, title: "最后一份晚餐", publicFact: "冰箱里只剩最后一份食物", handlingActionIds: ["eat-meal", "cook-meal", "buy-food"] },
  { id: "day-3-quiet-night", day: 3, offsetMs: 0, title: "安静的一晚", publicFact: "今晚有人需要安静工作", handlingActionIds: ["work", "watch-tv"] },
  { id: "day-4-visitor", day: 4, offsetMs: 0, title: "临时访客", publicFact: "玩家的朋友暂时占用了公共客厅", handlingActionIds: ["invite", "help"] },
  { id: "day-6-illness-blackout", day: 6, offsetMs: 0, title: "身体不适与停电", publicFact: "Jev 身体不适，公寓也短暂停电", handlingActionIds: ["help", "repair", "rest"] },
  { id: "day-7-lease", day: 7, offsetMs: 0, title: "租约到期", publicFact: "租约今晚到期", handlingActionIds: ["apologize", "help"] },
] as const;
