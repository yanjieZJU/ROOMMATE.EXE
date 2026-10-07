import { useEffect, useRef } from "react";

import type { RoommateWorld } from "../../shared/roommate-schemas";
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "../../game/render/apartment-layout";
import { GameBridge } from "./game-bridge";

export interface RoommateGameProps {
  world: RoommateWorld;
  bridge: GameBridge;
}

export function RoommateGame({ world, bridge }: RoommateGameProps) {
  const host = useRef<HTMLDivElement>(null);
  const initialWorld = useRef(world);

  useEffect(() => {
    let game: { destroy(removeCanvas?: boolean): void } | undefined;
    let cancelled = false;
    void Promise.all([import("phaser"), import("../../game/scenes/ApartmentScene")]).then(([phaserModule, sceneModule]) => {
      if (cancelled || !host.current) return;
      const Phaser = phaserModule.default;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        width: LOGICAL_WIDTH,
        height: LOGICAL_HEIGHT,
        parent: host.current,
        backgroundColor: "#17252a",
        pixelArt: true,
        antialias: false,
        physics: { default: "arcade", arcade: { debug: false } },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [new sceneModule.ApartmentScene(initialWorld.current, bridge)],
      });
    });
    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, [bridge]);

  useEffect(() => {
    bridge.emit("worldChanged", { world });
  }, [bridge, world]);

  return <div ref={host} className="roommate-game" aria-label="合租公寓游戏画面" tabIndex={0} />;
}

export { GameBridge };
