import { MODULE_ID } from "../constants.mjs";
import { ExposureStore } from "./exposure-store.mjs";
import { postExposureCard } from "./exposure-chat.mjs";

const TURN_FLAG = "sneakAttackTurn";

export const TECHNIQUES = {
  "perfuracao-precisa": {
    name: "Perfuração Precisa",
    reason: "o dano do Ataque Furtivo ignora Resistência ao tipo de dano da arma."
  },
  "quebra-ritmo": {
    name: "Quebra de Ritmo",
    reason: "o alvo não pode realizar Reações até o início do próximo turno dele."
  },
  "corte-passo": {
    name: "Corte de Passo",
    reason: "o deslocamento do alvo é reduzido em 3m até o início do próximo turno do Ladino."
  }
};

function rogueClass(actor) {
  return actor.items.find(item => item.type === "class" && item.system.identifier === "ladino-nova-era");
}

function turnKey() {
  return combatTurnKey(game.combat);
}

function combatTurnKey(combat) {
  if (!combat?.started) return null;
  return `${combat.id}:${combat.round}:${combat.turn}`;
}

function combatantFor(actor) {
  return game.combat?.combatants.find(combatant => {
    const combatActor = combatant.actor;
    return combatActor?.uuid === actor.uuid || combatActor?.id === actor.id;
  }) ?? null;
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

export function hasTechnicalExploitation(actor) {
  return actor.items.some(item => item.getFlag(MODULE_ID, "contentKey") === "exploracao-tecnica");
}

function movementChanges(actor) {
  const movement = actor.system.attributes?.movement ?? {};
  return ["walk", "burrow", "climb", "fly", "swim"]
    .filter(type => Number(movement[type]) > 0)
    .map(type => ({ key: `system.attributes.movement.${type}`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -3, priority: 20 }));
}

async function applyTechnique(sourceActor, targetActor, techniqueId) {
  const technique = TECHNIQUES[techniqueId];
  if (!technique || techniqueId === "perfuracao-precisa") return;
  const expiresActorUuid = techniqueId === "quebra-ritmo" ? targetActor.uuid : sourceActor.uuid;
  const expiresCombatantId = combatantFor(techniqueId === "quebra-ritmo" ? targetActor : sourceActor)?.id ?? null;
  const changes = techniqueId === "corte-passo" ? movementChanges(targetActor) : [];
  await targetActor.createEmbeddedDocuments("ActiveEffect", [{
    name: `${technique.name} — Nova Era`,
    img: "icons/svg/downgrade.svg",
    disabled: false,
    duration: { rounds: 1 },
    changes,
    flags: {
      [MODULE_ID]: {
        technique: techniqueId,
        appliedTurn: turnKey(),
        expiresActorUuid,
        expiresCombatantId
      }
    }
  }]);
}

async function executeSneakAttack(sourceActor, targetActor, techniqueId = null) {
  const technique = techniqueId ? TECHNIQUES[techniqueId] : null;
  if (techniqueId && !technique) {
    ui.notifications.warn("Nova Era: técnica de Exploração inválida.");
    return;
  }
  if (technique && !hasTechnicalExploitation(sourceActor)) {
    ui.notifications.warn("Nova Era: o Ladino ainda não possui Exploração Técnica.");
    return;
  }
  if (sneakAttackUsedThisTurn(sourceActor)) {
    ui.notifications.warn("Nova Era: o Ataque Furtivo já foi usado neste turno.");
    return;
  }
  const exposureCost = technique ? 2 : 1;
  const exposureBefore = ExposureStore.get(targetActor, sourceActor);
  if (exposureBefore < exposureCost) {
    ui.notifications.warn("Nova Era: o alvo não possui Exposição suficiente.");
    return;
  }

  const consumed = await ExposureStore.consume(targetActor, sourceActor, exposureCost);
  if (!consumed) return;
  await sourceActor.unsetFlag(MODULE_ID, "pendingDaggerHit");
  const current = turnKey();
  if (current) await sourceActor.setFlag(MODULE_ID, TURN_FLAG, current);

  const dice = sneakAttackDice(sourceActor);
  if (technique) await applyTechnique(sourceActor, targetActor, techniqueId);
  await postExposureCard({
    sourceActor,
    targetActor,
    value: ExposureStore.get(targetActor, sourceActor),
    reason: technique
      ? `Ataque Furtivo com ${technique.name}: 2 Exposições consumidas; ${technique.reason}`
      : `Ataque Furtivo: 1 Exposição consumida para causar ${dice}d6 de dano adicional.`
  });
  const roll = await new Roll(`${dice}d6`, sourceActor.getRollData()).evaluate();
  await sourceActor.setFlag(MODULE_ID, "lastSneakAttack", {
    turn: current,
    targetActorUuid: targetActor.uuid,
    dice,
    total: roll.total,
    exposureBefore,
    exposureCost
  });
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    flavor: technique
      ? `Ataque Furtivo — ${technique.name} contra ${targetActor.name}`
      : `Ataque Furtivo — Explorar Brecha contra ${targetActor.name}`
  });
  Hooks.callAll("novaEraSneakAttackUsed", { sourceActor, targetActor, dice, total: roll.total });
}

export async function requestSneakAttack(sourceActor, targetActor, techniqueId = null) {
  if (!sourceActor || !targetActor) {
    ui.notifications.warn("Nova Era: selecione exatamente um alvo.");
    return;
  }
  if (game.user.isGM || targetActor.isOwner) {
    await executeSneakAttack(sourceActor, targetActor, techniqueId);
    return;
  }
  game.socket.emit(`module.${MODULE_ID}`, {
    type: "sneakAttack",
    sourceActorUuid: sourceActor.uuid,
    targetActorUuid: targetActor.uuid,
    techniqueId
  });
}

async function handleSocket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  if (payload?.type !== "sneakAttack") return;
  const sourceActor = await fromUuid(payload.sourceActorUuid);
  const targetActor = await fromUuid(payload.targetActorUuid);
  if (!sourceActor || !targetActor) return;
  await executeSneakAttack(sourceActor, targetActor, payload.techniqueId);
}

function blocksReaction(activity) {
  if (!String(activity?.activation?.type ?? "").startsWith("reaction")) return false;
  const actor = activity.actor;
  const blocked = actor?.effects?.some(effect => effect.getFlag(MODULE_ID, "technique") === "quebra-ritmo");
  if (blocked) ui.notifications.warn("Nova Era: Quebra de Ritmo impede esta Reação.");
  return blocked;
}

async function expireTechniques(combat) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  const activeCombatant = combat.combatant;
  const activeActor = activeCombatant?.actor;
  if (!activeActor) return;
  const current = combatTurnKey(combat);
  const actors = new Set(game.actors);
  for (const token of canvas.tokens?.placeables ?? []) if (token.actor) actors.add(token.actor);
  for (const actor of actors) {
    const expired = actor.effects.filter(effect => {
      const expiresActorUuid = effect.getFlag(MODULE_ID, "expiresActorUuid");
      const expiresCombatantId = effect.getFlag(MODULE_ID, "expiresCombatantId");
      const appliedTurn = effect.getFlag(MODULE_ID, "appliedTurn");
      const reachedTurn = expiresCombatantId
        ? expiresCombatantId === activeCombatant.id
        : (expiresActorUuid === activeActor.uuid || expiresActorUuid === activeActor.id);
      return reachedTurn && appliedTurn !== current;
    });
    if (expired.length) await actor.deleteEmbeddedDocuments("ActiveEffect", expired.map(effect => effect.id));
  }
}

export function registerSneakAttackAutomation() {
  game.socket.on(`module.${MODULE_ID}`, payload => void handleSocket(payload));
  Hooks.on("dnd5e.preUseActivity", activity => !blocksReaction(activity));
  Hooks.on("updateCombat", combat => void expireTechniques(combat));
}
