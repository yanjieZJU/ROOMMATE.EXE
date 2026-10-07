import type { RoommateCharacter } from "../../shared/roommate-schemas";

export function NeedCue({ character }: { character: RoommateCharacter }) {
  const cues = [
    character.needs.hunger >= 70 ? "🍜 饥饿：望向厨房" : null,
    character.needs.energy <= 40 ? "💤 疲惫：打哈欠" : null,
    character.needs.mood <= 35 ? "… 心情：来回踱步" : null,
    character.needs.focus <= 35 ? "? 专注：容易分神" : null,
  ].filter(Boolean);
  if (cues.length === 0) return null;
  return <aside className="need-cue" aria-label={`${character.displayName} 的身体状态`}>{cues.map((cue) => <span key={cue}>{cue}</span>)}</aside>;
}
