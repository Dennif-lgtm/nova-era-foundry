import { MODULE_ID } from "../constants.mjs";
import { ExposureStore } from "../exposure/exposure-store.mjs";
import { postExposureCard } from "../exposure/exposure-chat.mjs";

const FLAGS = {
  evasion: "calculatedEvasionTurn",
  anticipation: "anticipationRound",
  firstImpression: "firstImpressionCombat",
  noticedError: "noticedErrorRound",
  fatalFlaw: "fatalFlawUsed"
};

function hasFeature(actor, key) {
  return actor?.items?.some(item => item.getFlag(MODULE_ID, "contentKey") === key);
}

function turnKey() {
  const combat = game.combat;
  return combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
}

function roundKey() {
  const combat = game.combat;
  return combat?.started ? `${combat.id}:${combat.round}` : null;
}

function targetLevel(actor) {
  const raw = actor?.type === "character" ? actor.system.details?.level : actor?.system.details?.cr;
  if (typeof raw === "string" && raw.includes("/")) {
    const [numerator, denominator] = raw.split("/").map(Number);
    return denominator ? numerator / denominator : 0;
  }
  return Number(raw) || 0;
}

function firstRoll(result) {
  return Array.isArray(result) ? result[0] : result;
}

async function rollDexteritySave(actor) {
  const result = await actor.rollSavingThrow({ ability: "dex" });
  return firstRoll(result);
}

async function sendRuleCard(actor, title, body) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<section class="nova-era exposure-card"><header>${title}</header><p>${body}</p></section>`
  });
}

export function canUseCalculatedEvasion(actor, targetActor) {
  if (!hasFeature(actor, "evasao-calculada") || !targetActor) return false;
  if (ExposureStore.get(targetActor, actor) < 1) return false;
  const current = turnKey();
  return !current || actor.getFlag(MODULE_ID, FLAGS.evasion) !== current;
}

export async function useCalculatedEvasion(actor, targetActor) {
  if (!canUseCalculatedEvasion(actor, targetActor)) {
    ui.notifications.warn("Nova Era: Evasão Calculada exige uma criatura selecionada com ao menos 1 Exposição.");
    return;
  }
  const roll = await rollDexteritySave(actor);
  if (!roll) return;
  const current = turnKey();
  if (current) await actor.setFlag(MODULE_ID, FLAGS.evasion, current);
  await sendRuleCard(actor, "Evasão Calculada", `Resultado do teste de Destreza: <strong>${roll.total}</strong>. Se o efeito foi originado diretamente por ${targetActor.name}, o Ladino sofre <strong>0 de dano em sucesso</strong> ou <strong>metade em falha</strong>. A Exposição não é consumida.`);
  Hooks.callAll("novaEraBaseFeatureChanged", { sourceActor: actor, targetActor, feature: "calculatedEvasion" });
}

export function completeReadingState(actor, targetActor) {
  return hasFeature(actor, "leitura-completa") && !!targetActor && ExposureStore.get(targetActor, actor) === 3;
}

export function canUseAnticipation(actor, targetActor) {
  if (!hasFeature(actor, "antecipacao") || !completeReadingState(actor, targetActor)) return false;
  const current = roundKey();
  return !current || actor.getFlag(MODULE_ID, FLAGS.anticipation) !== current;
}

export async function useAnticipation(actor, targetActor, option) {
  if (!canUseAnticipation(actor, targetActor)) {
    ui.notifications.warn("Nova Era: Antecipação exige Leitura Completa e uma Reação disponível.");
    return false;
  }
  const choices = {
    attack: ["Antecipar Golpe", "+4 CA contra o ataque declarado."],
    movement: ["Antecipar Movimento", "Mova até metade do deslocamento antes do movimento da criatura, sem provocar ataque de oportunidade dela."],
    technique: ["Antecipar Técnica", "+4 no teste de resistência provocado pela criatura."]
  };
  const choice = choices[option];
  if (!choice) return false;
  const current = roundKey();
  if (current) await actor.setFlag(MODULE_ID, FLAGS.anticipation, current);
  await sendRuleCard(actor, choice[0], `${choice[1]} Origem confirmada: <strong>${targetActor.name}</strong>. Use a Reação antes da resolução.`);
  Hooks.callAll("novaEraBaseFeatureChanged", { sourceActor: actor, targetActor, feature: "anticipation" });
  return true;
}

export function canUseFirstImpression(actor, targetActor) {
  const combat = game.combat;
  return hasFeature(actor, "olhar-predador") && !!targetActor && !!combat?.started
    && actor.getFlag(MODULE_ID, FLAGS.firstImpression) !== combat.id;
}

async function applyExposure(sourceActor, targetActor, amount, reason) {
  const value = await ExposureStore.add(targetActor, sourceActor, amount);
  await postExposureCard({ sourceActor, targetActor, value, reason });
}

export async function useFirstImpression(actor, targetActor) {
  if (!canUseFirstImpression(actor, targetActor)) {
    ui.notifications.warn("Nova Era: Primeira Impressão só pode ser usada uma vez após a Iniciativa ser rolada.");
    return;
  }
  const roll = firstRoll(await actor.rollSkill({ skill: "inv" }));
  if (!roll) return;
  const dc = Math.ceil(10 + targetLevel(targetActor));
  await actor.setFlag(MODULE_ID, FLAGS.firstImpression, game.combat.id);
  if (roll.total < dc) {
    await postExposureCard({ sourceActor: actor, targetActor, value: ExposureStore.get(targetActor, actor), reason: `Primeira Impressão: ${roll.total} contra CD ${dc} — falha.` });
    return;
  }
  await requestTargetChange(actor, targetActor, "firstImpression", { dc, total: roll.total });
}

export function canNoticeError(actor, targetActor) {
  if (!hasFeature(actor, "olhar-predador") || !targetActor || completeReadingState(actor, targetActor)) return false;
  const current = roundKey();
  return !current || actor.getFlag(MODULE_ID, FLAGS.noticedError) !== current;
}

export async function useNoticedError(actor, targetActor) {
  if (!canNoticeError(actor, targetActor)) {
    ui.notifications.warn("Nova Era: este uso exige uma criatura sem Leitura Completa e está limitado a uma vez por rodada.");
    return;
  }
  const current = roundKey();
  if (current) await actor.setFlag(MODULE_ID, FLAGS.noticedError, current);
  await requestTargetChange(actor, targetActor, "noticedError");
}

export function canUseFatalFlaw(actor, targetActor) {
  const lastSneakAttack = actor?.getFlag(MODULE_ID, "lastSneakAttack");
  return hasFeature(actor, "olhar-predador") && !!targetActor
    && lastSneakAttack?.exposureBefore === 3
    && lastSneakAttack?.turn === turnKey()
    && lastSneakAttack?.targetActorUuid === targetActor.uuid
    && !actor.getFlag(MODULE_ID, FLAGS.fatalFlaw);
}

export async function useFatalFlaw(actor, targetActor) {
  if (!canUseFatalFlaw(actor, targetActor)) {
    ui.notifications.warn("Nova Era: Falha Fatal exige Leitura Completa e só pode ser usada uma vez por Descanso Longo.");
    return;
  }
  await requestTargetChange(actor, targetActor, "fatalFlaw");
}

async function executeTargetChange(sourceActor, targetActor, type, data = {}) {
  if (type === "firstImpression") {
    await ExposureStore.set(targetActor, sourceActor, 3);
    await postExposureCard({ sourceActor, targetActor, value: 3, reason: `Primeira Impressão: ${data.total} contra CD ${data.dc} — sucesso; 3 Exposições obtidas.` });
  } else if (type === "noticedError") {
    await applyExposure(sourceActor, targetActor, 1, "Nenhum Erro Passa Despercebido: +1 Exposição após uma falha perceptível da criatura.");
  } else if (type === "fatalFlaw") {
    const remainingExposure = ExposureStore.get(targetActor, sourceActor);
    if (remainingExposure > 0) {
      const consumed = await ExposureStore.consume(targetActor, sourceActor, remainingExposure);
      if (!consumed) return;
    }
    await sourceActor.setFlag(MODULE_ID, FLAGS.fatalFlaw, true);
    const sneakAttack = sourceActor.getFlag(MODULE_ID, "lastSneakAttack");
    const maximum = Number(sneakAttack?.dice ?? 0) * 6;
    const adjustment = Math.max(0, maximum - Number(sneakAttack?.total ?? 0));
    await sendRuleCard(sourceActor, "Falha Fatal", `As 3 Exposições de ${targetActor.name}, incluindo a usada pelo Ataque Furtivo, foram consumidas. O Ataque Furtivo passa para <strong>${maximum} de dano</strong>; acrescente <strong>${adjustment}</strong> ao resultado já rolado. Aplique também uma Técnica de Exploração sem custo adicional.`);
  }
  Hooks.callAll("novaEraBaseFeatureChanged", { sourceActor, targetActor, feature: type });
}

async function requestTargetChange(sourceActor, targetActor, type, data = {}) {
  if (game.user.isGM || targetActor.isOwner) return executeTargetChange(sourceActor, targetActor, type, data);
  game.socket.emit(`module.${MODULE_ID}`, { type: "advancedBaseFeature", feature: type, sourceActorUuid: sourceActor.uuid, targetActorUuid: targetActor.uuid, data });
}

async function handleSocket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || payload?.type !== "advancedBaseFeature") return;
  const sourceActor = await fromUuid(payload.sourceActorUuid);
  const targetActor = await fromUuid(payload.targetActorUuid);
  if (sourceActor && targetActor) await executeTargetChange(sourceActor, targetActor, payload.feature, payload.data);
}

async function resetLongRest(actor, result, config) {
  const recovered = result?.longRest === true || config?.type === "long";
  if (!actor || !recovered || !actor.getFlag(MODULE_ID, FLAGS.fatalFlaw)) return;
  await actor.unsetFlag(MODULE_ID, FLAGS.fatalFlaw);
  Hooks.callAll("novaEraBaseFeatureChanged", { sourceActor: actor, feature: "longRest" });
}

export function registerAdvancedBaseFeatureAutomation() {
  game.socket.on(`module.${MODULE_ID}`, payload => void handleSocket(payload));
  Hooks.on("dnd5e.restCompleted", (actor, result, config) => void resetLongRest(actor, result, config));
}
