import Phaser from "phaser";

import type { GameBridge } from "../../client/game/game-bridge";
import type { RoommateWorld } from "../../shared/roommate-schemas";
import type { CharacterId, MacroAction } from "../../shared/roommate-schemas";
import { InputState } from "../input/input-state";
import { APARTMENT_LAYOUT } from "../render/apartment-layout";
import { OBJECT_LABEL_STYLE, ROOM_LABEL_STYLE, placeObjectLabel } from "../render/apartment-labels";
import { PIXEL_PALETTE, createPixelTexture } from "../render/pixel-texture";
import { TEXTURE_ATLAS } from "../render/texture-atlas";
import type { NavigationWaypoint } from "../navigation/interaction-points";
import { registerSceneActionHandlers } from "./scene-action-controller";

function color(value: string): number {
  return Number.parseInt(value.slice(1), 16);
}

export class ApartmentScene extends Phaser.Scene {
  private readonly inputState = new InputState();
  private readonly sprites = new Map<CharacterId, Phaser.Physics.Arcade.Sprite>();
  private readonly activeTweens = new Map<string, Phaser.Tweens.Tween>();
  private readonly activeTimers = new Map<string, Phaser.Time.TimerEvent>();
  private readonly visualRejectors = new Map<string, (reason: unknown) => void>();
  private readonly visualActors = new Map<string, CharacterId>();
  private readonly busyActors = new Set<CharacterId>();
  private readonly intentIcons = new Map<CharacterId, Phaser.GameObjects.Text>();
  private worldState: RoommateWorld;
  private detachWorld?: () => void;
  private detachAction?: () => void;
  private detachSceneActions?: () => void;

  constructor(world: RoommateWorld, private readonly bridge: GameBridge) {
    super({ key: "ApartmentScene" });
    this.worldState = structuredClone(world);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(color(PIXEL_PALETTE.outline));
    for (const definition of TEXTURE_ATLAS) createPixelTexture(this, definition);
    for (const room of APARTMENT_LAYOUT.rooms) {
      this.add.rectangle(room.x, room.y, room.width, room.height, color(PIXEL_PALETTE.cream)).setOrigin(0).setStrokeStyle(2, color(PIXEL_PALETTE.outline));
      this.add.text(room.x + 6, room.y + 5, room.label, ROOM_LABEL_STYLE).setResolution(2).setDepth(3);
    }
    for (const layout of APARTMENT_LAYOUT.objects) {
      const state = this.worldState.objects.find((object) => object.id === layout.id);
      const object = this.add.rectangle(layout.x, layout.y, layout.width, layout.height, color(PIXEL_PALETTE.orange)).setOrigin(0).setStrokeStyle(2, color(PIXEL_PALETTE.outline));
      object.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        this.bridge.emit("objectSelected", { objectId: layout.id });
        this.bridge.emit("targetSelected", { targetType: "object", targetId: layout.id, screenX: layout.x + layout.width / 2, screenY: layout.y });
      });
      if (state) {
        const room = APARTMENT_LAYOUT.rooms.find((candidate) => candidate.id === layout.roomId)!;
        const label = placeObjectLabel(layout, room, state.label);
        this.add.text(label.x, label.y, state.label, OBJECT_LABEL_STYLE).setResolution(2).setDepth(4);
      }
    }

    const playerSpawn = APARTMENT_LAYOUT.nodes.find((node) => node.id === APARTMENT_LAYOUT.spawns.player.nodeId)!;
    const jevSpawn = APARTMENT_LAYOUT.nodes.find((node) => node.id === APARTMENT_LAYOUT.spawns.jev.nodeId)!;
    const player = this.physics.add.sprite(playerSpawn.x, playerSpawn.y, "player").setCollideWorldBounds(true);
    const jev = this.physics.add.sprite(jevSpawn.x, jevSpawn.y, "jev").setCollideWorldBounds(true);
    this.sprites.set("player", player);
    this.sprites.set("jev", jev);
    jev.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.bridge.emit("targetSelected", {
      targetType: "character", targetId: "jev", screenX: jev.x, screenY: jev.y - 10,
    }));

    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => this.inputState.keyDown(event.code));
    this.input.keyboard?.on("keyup", (event: KeyboardEvent) => this.inputState.keyUp(event.code));
    window.addEventListener("blur", this.inputState.handleBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.detachWorld = this.bridge.on("worldChanged", ({ world }) => { this.worldState = structuredClone(world); });
    this.detachAction = this.bridge.on("playAction", ({ actorId, actionId, durationMs }) => this.playAction(actorId, actionId, durationMs));
    this.detachSceneActions = registerSceneActionHandlers(this.bridge, {
      navigate: (actorId, waypoints, queueId) => this.navigateCharacter(actorId, waypoints, queueId),
      perform: (actorId, action, queueId) => this.performCharacter(actorId, action, queueId),
      cancel: (queueId) => this.cancelVisualAction(queueId),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.bridge.emit("sceneReady", undefined);
  }

  update(): void {
    const player = this.sprites.get("player");
    if (!player || this.busyActors.has("player")) return;
    const vector = this.inputState.vector();
    const speed = 62;
    player.setVelocity(vector.x * speed, vector.y * speed);
    if (vector.x !== 0 || vector.y !== 0) {
      const room = APARTMENT_LAYOUT.rooms.find((candidate) => player.x >= candidate.x && player.x <= candidate.x + candidate.width && player.y >= candidate.y && player.y <= candidate.y + candidate.height);
      if (room) this.bridge.emit("playerMoved", { x: player.x, y: player.y, roomId: room.id });
    }
  }

  playAction(actorId: "player" | "jev", actionId: string, durationMs: number): void {
    this.time.delayedCall(durationMs, () => this.bridge.emit("animationCompleted", { actorId, actionId }));
  }

  private navigateCharacter(actorId: CharacterId, waypoints: NavigationWaypoint[], queueId: string): Promise<void> {
    const sprite = this.sprites.get(actorId);
    if (!sprite) return Promise.reject(new Error(`Missing sprite: ${actorId}`));
    this.busyActors.add(actorId);
    sprite.setVelocity(0, 0);
    this.showIntent(actorId, "→");
    return new Promise((resolve, reject) => {
      this.visualRejectors.set(queueId, reject);
      this.visualActors.set(queueId, actorId);
      const moveNext = (index: number) => {
        const waypoint = waypoints[index];
        if (!waypoint) {
          this.activeTweens.delete(queueId);
          this.visualRejectors.delete(queueId);
          this.visualActors.delete(queueId);
          this.busyActors.delete(actorId);
          this.clearIntent(actorId);
          resolve();
          return;
        }
        sprite.setFlipX(waypoint.x < sprite.x);
        const duration = Math.max(80, Math.round(Phaser.Math.Distance.Between(sprite.x, sprite.y, waypoint.x, waypoint.y) / 62 * 1_000));
        const tween = this.tweens.add({
          targets: sprite,
          x: waypoint.x,
          y: waypoint.y,
          duration,
          onUpdate: () => this.positionIntent(actorId),
          onComplete: () => moveNext(index + 1),
        });
        this.activeTweens.set(queueId, tween);
      };
      moveNext(0);
    });
  }

  private performCharacter(actorId: CharacterId, action: MacroAction, queueId: string): Promise<void> {
    const sprite = this.sprites.get(actorId);
    if (!sprite) return Promise.reject(new Error(`Missing sprite: ${actorId}`));
    this.busyActors.add(actorId);
    this.showIntent(actorId, action.label.slice(0, 1));
    sprite.setTexture(`action-${action.animationKey}`);
    return new Promise((resolve, reject) => {
      this.visualRejectors.set(queueId, reject);
      this.visualActors.set(queueId, actorId);
      const timer = this.time.delayedCall(action.durationMs, () => {
        sprite.setTexture(actorId);
        this.activeTimers.delete(queueId);
        this.visualRejectors.delete(queueId);
        this.visualActors.delete(queueId);
        this.busyActors.delete(actorId);
        this.clearIntent(actorId);
        resolve();
      });
      this.activeTimers.set(queueId, timer);
    });
  }

  private cancelVisualAction(queueId: string): void {
    this.activeTweens.get(queueId)?.stop();
    this.activeTweens.delete(queueId);
    this.activeTimers.get(queueId)?.remove(false);
    this.activeTimers.delete(queueId);
    const reject = this.visualRejectors.get(queueId);
    const actorId = this.visualActors.get(queueId);
    this.visualRejectors.delete(queueId);
    this.visualActors.delete(queueId);
    if (actorId) {
      this.busyActors.delete(actorId);
      this.sprites.get(actorId)?.setTexture(actorId);
      this.clearIntent(actorId);
    }
    reject?.(new DOMException("cancelled", "AbortError"));
  }

  private showIntent(actorId: CharacterId, text: string): void {
    const icon = this.intentIcons.get(actorId) ?? this.add.text(0, 0, text, {
      fontFamily: "monospace", fontSize: "9px", color: "#17252a", backgroundColor: "#f6e7c8", padding: { x: 2, y: 1 },
    }).setDepth(8).setResolution(2);
    icon.setText(text).setVisible(true);
    this.intentIcons.set(actorId, icon);
    this.positionIntent(actorId);
  }

  private positionIntent(actorId: CharacterId): void {
    const sprite = this.sprites.get(actorId);
    const icon = this.intentIcons.get(actorId);
    if (sprite && icon) icon.setPosition(sprite.x - icon.width / 2, sprite.y - 24);
  }

  private clearIntent(actorId: CharacterId): void {
    this.intentIcons.get(actorId)?.setVisible(false);
  }

  private readonly onVisibilityChange = (): void => this.inputState.handleVisibilityChange(document.hidden);

  private shutdown(): void {
    window.removeEventListener("blur", this.inputState.handleBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.detachWorld?.();
    this.detachAction?.();
    this.detachSceneActions?.();
    for (const queueId of [...this.visualRejectors.keys()]) this.cancelVisualAction(queueId);
    this.inputState.clear();
  }
}
