import { MODULE_ID } from "../constants.mjs";
import { ExposureStore } from "../exposure/exposure-store.mjs";
import { postExposureCard } from "../exposure/exposure-chat.mjs";

const FLAGS = {
  pendingDagger: "pendingDaggerHit",
  testBlade: "testBladeTurn",
  blindSpot: "blindSpotTurn",
  deciphered: "decipheredStrikeTurn"
};

function turnKey() {
  const combat = game.combat;
  return combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
}

function hasFeature(actor, key) {
  return actor.items.some(item => item.getFlag(MODULE_ID, "contentKey") === key);
}

function selectedTarget() {
  const targets = [...game.user.targets];
  return targets.length === 1 ? targets[0].actor : null;
}

function isDagger(item) {
  const baseItem = item?.system?.type?.baseItem ?? item?.system?.identifier ?? "";
  const name = item?.name?.toLocaleLowerCase("pt-BR") ?? "";
  return baseItem === "dagger" || name.includes("adaga") || name.includes("dagger");
}

export function pendingTestBlade(actor, targetActor) {
  const pending = actor.getFlag(MODULE_ID, FLAGS.pendingDagger);
  if (!pending || pending.targetActorUuid !== targetActor?.uuid) return false;
  const current = turnKey();
  if (current && pending.turn !== current) return false;
  return actor.getFlag(MODULE_ID, FLAGS.testBlade) !== current;
}

export function canUseBlindSpot(actor) {
  if (!hasFeature(actor, "ponto-cego")) return false;
  const current = turnKey();
  return !!current
    && actor.getFlag(MODULE_ID, "exposureConsumedTurn") === current
    && actor.getFlag(MODULE_ID, FLAGS.blindSpot) !== current;
}

export function hasCalculatedEvasion(actor) {
  return hasFeature(actor, "evasao-calculada");
}

export function hasCompleteReading(actor) {
  return hasFeature(actor, "leitura-completa");
}

export function hasDecipheredStrike(actor) {
  return hasFeature(actor, "golpe-decifrado");
}

export function canUseDecipheredStrike(actor, targetActor) {
  if (!hasDecipheredStrike(actor) || !targetActor) return false;
  if (ExposureStore.get(targetActor, actor) < 3) return false;
  const current = turnKey();
  return !current || actor.getFlag(MODULE_ID, FLAGS.deciphered) !== current;
}

async function executeTestBlade(sourceActor, targetActor) {
  if (!pendingTestBlade(sourceActor, targetActor)) {
    ui.notifications.warn("Nova Era: não existe um acerto válido de adaga para Lâmina de Teste.");
    return;
  }
  const value = await ExposureStore.add(targetActor, sourceActor, 1);
  const current = turnKey();
  if (current) await sourceActor.setFlag(MODULE_ID, FLAGS.testBlade, current);
  await sourceActor.unsetFlag(MODULE_ID, FLAGS.pendingDagger);
  await postExposureCard({ sourceActor, targetActor, value, reason: "Lâmina de Teste: +1 Exposição após acertar com uma adaga sem consumir Exposição." });
  Hooks.callAll("novaEraBaseFeatureChanged", { sourceActor, targetActor, feature: "testBlade" });
}

export async function requestTestBlade(sourceActor, targetActor) {
  if (!sourceActor || !targetActor) return;
  if (game.user.isGM || targetActor.isOwner) return executeTestBlade(sourceActor, targetActor);
  game.socket.emit(`module.${MODULE_ID}`, {
    type: "testBlade",
    sourceActorUuid: sourceActor.uuid,
    targetActorUuid: targetActor.uuid
  });
}

export async function useBlindSpot(actor) {
  if (!canUseBlindSpot(actor)) {
    ui.notifications.warn("Nova Era: Ponto Cego exige consumo de Exposição neste turno.");
    return;
  }
  const current = turnKey();
  await actor.setFlag(MODULE_ID, FLAGS.blindSpot, current);
  await actor.rollSkill({ skill: "ste" });
  ui.notifications.info("Nova Era: teste de Furtividade realizado com Ponto Cego. Confirme se existe uma condição válida para se esconder.");
  Hooks.callAll("novaEraBaseFeatureChanged", { sourceActor: actor, feature: "blindSpot" });
}

export async function useDecipheredStrike(actor, targetActor) {
  if (!canUseDecipheredStrike(actor, targetActor)) {
    ui.notifications.warn("Nova Era: Golpe Decifrado exige 3 Exposições e só pode ser usado uma vez por turno.");
    return;
  }
  const current = turnKey();
  if (current) await actor.setFlag(MODULE_ID, FLAGS.deciphered, current);
  const roll = await new Roll("2d6", actor.getRollData()).evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `Golpe Decifrado contra ${targetActor.name} — não consome Exposição`
  });
  Hooks.callAll("novaEraBaseFeatureChanged", { sourceActor: actor, targetActor, feature: "decipheredStrike" });
}

async function recordDaggerHit(rolls, { subject } = {}) {
  const actor = subject?.actor;
  const targetActor = selectedTarget();
  if (!actor || !targetActor || !hasFeature(actor, "danca-das-laminas") || !isDagger(subject.item)) return;
  const roll = rolls?.[0];
  const armorClass = Number(targetActor.system.attributes?.ac?.value ?? Infinity);
  if (!roll || roll.total < armorClass) return;
  await actor.setFlag(MODULE_ID, FLAGS.pendingDagger, {
    targetActorUuid: targetActor.uuid,
    turn: turnKey(),
    total: roll.total
  });
  ui.notifications.info("Nova Era: Lâmina de Teste disponível. Passo Cortante também permite gastar até 3m para se afastar deste alvo.");
  Hooks.callAll("novaEraBaseFeatureChanged", { sourceActor: actor, targetActor, feature: "daggerHit" });
}

async function handleSocket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  if (payload?.type !== "testBlade") return;
  const sourceActor = await fromUuid(payload.sourceActorUuid);
  const targetActor = await fromUuid(payload.targetActorUuid);
  if (sourceActor && targetActor) await executeTestBlade(sourceActor, targetActor);
}

export function registerBaseFeatureAutomation() {
  Hooks.on("dnd5e.postRollAttack", (rolls, data) => void recordDaggerHit(rolls, data));
  Hooks.on("updateCombat", () => Hooks.callAll("novaEraBaseFeatureChanged", { feature: "combatTurn" }));
  game.socket.on(`module.${MODULE_ID}`, payload => void handleSocket(payload));
}
