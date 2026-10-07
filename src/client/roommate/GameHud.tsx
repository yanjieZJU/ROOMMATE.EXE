import { ROOMMATE_DAY_DURATION_MS } from "../../shared/constants";
import type { RoommateSession } from "../../shared/roommate-schemas";

export function GameHud({ session }: { session: RoommateSession }) {
  const progress = Math.min(1, session.world.elapsedMs / ROOMMATE_DAY_DURATION_MS);
  const minutes = Math.floor(progress * 16 * 60 + 7 * 60);
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const jev = session.world.characters.find((character) => character.id === "jev")!;
  return (
    <header className="game-hud">
      <div><strong>第 {session.world.day} 天</strong><span>{time}</span></div>
      <p>{session.world.publicEvent ?? "公寓里暂时平静"}</p>
      <small>{jev.backgroundFacts.join(" · ")}</small>
    </header>
  );
}
