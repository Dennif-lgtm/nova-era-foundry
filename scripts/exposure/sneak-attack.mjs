import { MODULE_ID } from "../constants.mjs";
import { ExposureStore } from "./exposure-store.mjs";
import { postExposureCard } from "./exposure-chat.mjs";

const TURN_FLAG = "sneakAttackTurn";

function rogueClass(actor) {
  return actor.items.find(item => item.type === "class" && item.system.identifier === "ladino-nova-era");
}

function turnKey() {
  const combat = game.combat;
  if (!combat?.started) return null;
  return `${combat.id}:${combat.round}:${combat.turn}`;
}

export function sneakAttackDice(actor) {
  const level = Number(rogueClass(actor)?.system.levels ?? 1);
  if (level >= 17) return 9;
  if (level >= 11) return 6;
  if (level >= 5) return 3;
  return 1;
}

export function sneakAttackUsedThisTurn(actor) {
  const current = turnKey();
  return current ? actor.getFlag(MODULE_ID, TURN_FLAG) === current : false;
}

async function executeSneakAttack(sourceActor, targetActor) {
  if (sneakAttackUsedThisTurn(sourceActor)) {
    ui.notifications.warn("Nova Era: o Ataque Furtivo já foi usado neste turno.");
    return;
  }
  if (ExposureStore.get(targetActor, sourceActor) < 1) {
    ui.notifications.warn("Nova Era: o alvo não possui Exposição suficiente.");
    return;
  }

  const consumed = await ExposureStore.consume(targetActor, sourceActor, 1);
  if (!consumed) return;
  const current = turnKey();
  if (current) await sourceActor.setFlag(MODULE_ID, TURN_FLAG, current);

  const dice = sneakAttackDice(sourceActor);
  await postExposureCard({
    sourceActor,
    targetActor,
    value: ExposureStore.get(targetActor, sourceActor),
    reason: `Ataque Furtivo: 1 Exposição consumida para causar ${dice}d6 de dano adicional.`
  });
  const roll = await new Roll(`${dice}d6`, sourceActor.getRollData()).evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    flavor: `Ataque Furtivo — Explorar Brecha contra ${targetActor.name}`
  });
  Hooks.callAll("novaEraSneakAttackUsed", { sourceActor, targetActor, dice, total: roll.total });
}

export async function requestSneakAttack(sourceActor, targetActor) {
  if (!sourceActor || !targetActor) {
    ui.notifications.warn("Nova Era: selecione exatamente um alvo.");
    return;
  }
  if (game.user.isGM || targetActor.isOwner) {
    await executeSneakAttack(sourceActor, targetActor);
    return;
  }
  game.socket.emit(`module.${MODULE_ID}`, {
    type: "sneakAttack",
    sourceActorUuid: sourceActor.uuid,
    targetActorUuid: targetActor.uuid
  });
}

async function handleSocket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  if (payload?.type !== "sneakAttack") return;
  const sourceActor = await fromUuid(payload.sourceActorUuid);
  const targetActor = await fromUuid(payload.targetActorUuid);
  if (!sourceActor || !targetActor) return;
  await executeSneakAttack(sourceActor, targetActor);
}

export function registerSneakAttackAutomation() {
  game.socket.on(`module.${MODULE_ID}`, payload => void handleSocket(payload));
}
