import { MODULE_ID } from "../constants.mjs";
import { ExposureStore } from "../exposure/exposure-store.mjs";
import { useAnticipation } from "./advanced-base-features.mjs";

const EFFECT_ICON = "icons/svg/aura.svg";

function turnKey() {
  const combat = game.combat;
  return combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
}

function selectedActor() {
  const controlled = canvas.tokens?.controlled ?? [];
  return controlled.length === 1 ? controlled[0].actor : game.user.character;
}

function selectedTarget() {
  const targets = [...game.user.targets];
  return targets.length === 1 ? targets[0].actor : null;
}

function hasFeature(actor, key) {
  return actor?.items?.some(item => item.getFlag(MODULE_ID, "contentKey") === key);
}

function effectFor(actor, type) {
  return actor?.effects?.find(effect => effect.getFlag(MODULE_ID, "secondaryEffect") === type);
}

async function replaceEffect(actor, source) {
  const previous = effectFor(actor, source.flags[MODULE_ID].secondaryEffect);
  if (previous) await actor.deleteEmbeddedDocuments("ActiveEffect", [previous.id]);
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [source]);
  return effect;
}

async function removeEffect(actor, type) {
  const effect = effectFor(actor, type);
  if (effect) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
}

function readingReady(actor, targetActor) {
  return hasFeature(actor, "leitura-completa") && !!targetActor
    && ExposureStore.get(targetActor, actor) === 3;
}

export async function prepareReadingAttack(actor = selectedActor(), targetActor = selectedTarget()) {
  if (!actor || !readingReady(actor, targetActor)) {
    ui.notifications.warn("Nova Era: selecione um Ladino e um alvo com 3 Exposições.");
    return;
  }
  const current = turnKey();
  if (current && actor.getFlag(MODULE_ID, "completeReadingAttackTurn") === current) {
    ui.notifications.warn("Nova Era: o bônus do primeiro ataque de Leitura Completa já foi usado neste turno.");
    return;
  }
  await replaceEffect(actor, {
    name: "Leitura Completa — Próximo Ataque +2",
    img: EFFECT_ICON,
    disabled: false,
    changes: [
      { key: "system.bonuses.mwak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2", priority: 20 },
      { key: "system.bonuses.rwak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2", priority: 20 }
    ],
    flags: { [MODULE_ID]: { secondaryEffect: "readingAttack", targetActorUuid: targetActor.uuid, appliedTurn: current } }
  });
  ui.notifications.info(`Nova Era: +2 preparado para o próximo ataque contra ${targetActor.name}.`);
}

export async function prepareReadingSave(actor = selectedActor(), targetActor = selectedTarget()) {
  if (!actor || !readingReady(actor, targetActor)) {
    ui.notifications.warn("Nova Era: selecione um Ladino e um alvo com 3 Exposições.");
    return;
  }
  await replaceEffect(actor, {
    name: "Leitura Completa — Próxima Resistência +2",
    img: EFFECT_ICON,
    disabled: false,
    changes: [{ key: "system.bonuses.abilities.save", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2", priority: 20 }],
    flags: { [MODULE_ID]: { secondaryEffect: "readingSave", targetActorUuid: targetActor.uuid, appliedTurn: turnKey() } }
  });
  ui.notifications.info(`Nova Era: +2 preparado para a próxima resistência provocada por ${targetActor.name}.`);
}

export async function prepareAnticipationArmor(actor = selectedActor(), targetActor = selectedTarget()) {
  if (!actor || !targetActor || !hasFeature(actor, "antecipacao") || !readingReady(actor, targetActor)) {
    ui.notifications.warn("Nova Era: Antecipar Golpe exige Leitura Completa contra o alvo selecionado.");
    return;
  }
  await replaceEffect(actor, {
    name: "Antecipar Golpe — +4 CA",
    img: EFFECT_ICON,
    disabled: false,
    duration: { rounds: 1 },
    changes: [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 4, priority: 30 }],
    flags: { [MODULE_ID]: { secondaryEffect: "anticipationArmor", targetActorUuid: targetActor.uuid, appliedTurn: turnKey() } }
  });
  ui.notifications.info("Nova Era: +4 CA aplicado. Use a macro novamente após resolver o ataque para remover o efeito.");
}

export async function clearAnticipationArmor(actor = selectedActor()) {
  if (!actor) return;
  await removeEffect(actor, "anticipationArmor");
  ui.notifications.info("Nova Era: bônus de CA de Antecipar Golpe removido.");
}

export async function prepareAnticipationSave(actor = selectedActor(), targetActor = selectedTarget()) {
  if (!actor || !targetActor || !hasFeature(actor, "antecipacao") || !readingReady(actor, targetActor)) {
    ui.notifications.warn("Nova Era: Antecipar Técnica exige Leitura Completa contra o alvo selecionado.");
    return;
  }
  await replaceEffect(actor, {
    name: "Antecipar Técnica — Próxima Resistência +4",
    img: EFFECT_ICON,
    disabled: false,
    changes: [{ key: "system.bonuses.abilities.save", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "4", priority: 30 }],
    flags: { [MODULE_ID]: { secondaryEffect: "anticipationSave", targetActorUuid: targetActor.uuid, appliedTurn: turnKey() } }
  });
  ui.notifications.info("Nova Era: +4 preparado para a próxima resistência.");
}

async function macroAnticipationArmor(actor = selectedActor(), targetActor = selectedTarget()) {
  if (await useAnticipation(actor, targetActor, "attack")) await prepareAnticipationArmor(actor, targetActor);
}

async function macroAnticipationMovement(actor = selectedActor(), targetActor = selectedTarget()) {
  await useAnticipation(actor, targetActor, "movement");
}

async function macroAnticipationSave(actor = selectedActor(), targetActor = selectedTarget()) {
  if (await useAnticipation(actor, targetActor, "technique")) await prepareAnticipationSave(actor, targetActor);
}

async function validatePreparedAttack(config) {
  const actor = config?.subject?.actor ?? config?.actor;
  const effect = effectFor(actor, "readingAttack");
  if (!effect) return true;
  const targetActor = selectedTarget();
  if (targetActor?.uuid === effect.getFlag(MODULE_ID, "targetActorUuid")) return true;
  ui.notifications.warn("Nova Era: o +2 de Leitura Completa foi preparado para outro alvo. Selecione o alvo correto antes de atacar.");
  return false;
}

async function finishPreparedAttack(rolls, { subject } = {}) {
  const actor = subject?.actor;
  const effect = effectFor(actor, "readingAttack");
  if (effect) {
    const current = turnKey();
    if (current) await actor.setFlag(MODULE_ID, "completeReadingAttackTurn", current);
    await removeEffect(actor, "readingAttack");
    Hooks.callAll("novaEraBaseFeatureChanged", { sourceActor: actor, feature: "readingAttack" });
  }

  for (const token of game.user.targets) {
    const targetActor = token.actor;
    const armorEffect = effectFor(targetActor, "anticipationArmor");
    if (armorEffect?.getFlag(MODULE_ID, "targetActorUuid") === actor?.uuid) {
      await removeEffect(targetActor, "anticipationArmor");
      ui.notifications.info(`Nova Era: Antecipar Golpe de ${targetActor.name} foi resolvido e removido.`);
    }
  }
}

async function finishPreparedSave(rolls, { subject } = {}) {
  const actor = subject;
  if (!actor) return;
  if (effectFor(actor, "anticipationSave")) await removeEffect(actor, "anticipationSave");
  else if (effectFor(actor, "readingSave")) await removeEffect(actor, "readingSave");
}

export function registerSecondaryEffects() {
  Hooks.on("dnd5e.preRollAttack", config => validatePreparedAttack(config));
  Hooks.on("dnd5e.postRollAttack", (rolls, data) => void finishPreparedAttack(rolls, data));
  Hooks.on("dnd5e.rollSavingThrow", (rolls, data) => void finishPreparedSave(rolls, data));
}

export const secondaryMacroApi = {
  readingAttack: prepareReadingAttack,
  readingSave: prepareReadingSave,
  anticipationArmor: macroAnticipationArmor,
  clearAnticipationArmor,
  anticipationMovement: macroAnticipationMovement,
  anticipationSave: macroAnticipationSave
};
