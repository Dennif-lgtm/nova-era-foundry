import { MODULE_ID } from "../constants.mjs";

const STATE_FLAG = "berserkerBlood";
const FRENZY_EFFECT = "Frenesi — Nova Era";
const violenceTimers = new Map();

function classItem(actor) {
  return actor?.items?.find(item => item.type === "class" && (item.system.identifier === "berserker-nova-era" || item.getFlag(MODULE_ID, "contentKey") === "berserker"));
}

export function isNovaEraBerserker(actor) {
  return !!classItem(actor);
}

export function berserkerLevel(actor) {
  return Number(classItem(actor)?.system.levels ?? 0);
}

function abilityMod(actor, ability) {
  return Number(actor?.system?.abilities?.[ability]?.mod ?? 0);
}

function proficiency(actor) {
  return Number(actor?.system?.attributes?.prof ?? 2);
}

export function bloodMaximum(actor) {
  return Math.max(3, proficiency(actor) + abilityMod(actor, "con"));
}

export function bloodThreshold(actor) {
  return Math.ceil(bloodMaximum(actor) / 2);
}

export function bloodState(actor) {
  const stored = actor?.getFlag(MODULE_ID, STATE_FLAG) ?? {};
  const maximum = bloodMaximum(actor);
  const points = Math.clamp(Number(stored.points ?? 0), 0, maximum);
  return { points, maximum, threshold: Math.ceil(maximum / 2), frenzy: points >= Math.ceil(maximum / 2), lastViolence: Number(stored.lastViolence ?? 0) };
}

function mayManage(actor) {
  return actor?.isOwner || game.user.isGM;
}

function isAutomationAuthority(actor) {
  const activeOwners = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER"));
  if (activeOwners.length) return activeOwners[0].id === game.user.id;
  return game.user.isGM && game.users.activeGM?.id === game.user.id;
}

function hasFeature(actor, key) {
  return actor?.items?.some(item => item.getFlag(MODULE_ID, "contentKey") === key);
}

function turnKey() {
  const combat = game.combat;
  return combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : `free:${Math.floor(Date.now() / 6000)}`;
}

function roundKey() {
  const combat = game.combat;
  return combat?.started ? `${combat.id}:${combat.round}` : `free:${Math.floor(Date.now() / 6000)}`;
}

async function syncFrenzyEffect(actor, active) {
  const existing = actor.effects.find(effect => effect.getFlag(MODULE_ID, "berserkerFrenzy"));
  if (active && !existing) {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: FRENZY_EFFECT,
      img: `modules/${MODULE_ID}/assets/icons/berserker/coracao-frenesi-v1.png`,
      disabled: false,
      duration: {},
      changes: [
        { key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "slashing", priority: 20 },
        { key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "piercing", priority: 20 },
        { key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "bludgeoning", priority: 20 },
        { key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "3", priority: 20 }
      ],
      flags: { [MODULE_ID]: { berserkerFrenzy: true } }
    }]);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era berserker-chat"><h2>O sangue exige violência.</h2><p><strong>${actor.name}</strong> entra em Frenesi.</p></section>` });
  } else if (!active && existing) {
    await existing.delete();
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era berserker-chat"><h2>O pulso desacelera.</h2><p>O Frenesi de <strong>${actor.name}</strong> termina.</p></section>` });
  }
}

function scheduleViolenceExpiry(actor) {
  clearTimeout(violenceTimers.get(actor.uuid));
  const timer = setTimeout(async () => {
    if (!actor || !isNovaEraBerserker(actor) || !mayManage(actor)) return;
    const state = bloodState(actor);
    if (Date.now() - state.lastViolence < 59_000) return scheduleViolenceExpiry(actor);
    const floor = berserkerLevel(actor) >= 19 ? Math.max(0, state.threshold - 1) : 0;
    await setBloodPoints(actor, floor, { reason: "Fim da Violência", violence: false });
  }, 60_500);
  violenceTimers.set(actor.uuid, timer);
}

export async function setBloodPoints(actor, value, { reason = "Ajuste", violence = false } = {}) {
  if (!isNovaEraBerserker(actor) || !mayManage(actor)) return bloodState(actor);
  const before = bloodState(actor);
  const points = Math.clamp(Number(value) || 0, 0, before.maximum);
  const next = { points, lastViolence: violence ? Date.now() : before.lastViolence };
  await actor.setFlag(MODULE_ID, STATE_FLAG, next);
  await syncFrenzyEffect(actor, points >= before.threshold);
  if (violence) scheduleViolenceExpiry(actor);
  Hooks.callAll("novaEraBerserkerChanged", { actor, before, after: bloodState(actor), reason });
  return bloodState(actor);
}

export async function gainBlood(actor, amount = 1, reason = "Violência") {
  const state = bloodState(actor);
  return setBloodPoints(actor, state.points + amount, { reason, violence: true });
}

export async function spendBlood(actor, amount, { reason = "Gasto de Sangue", sacrifice = false } = {}) {
  const state = bloodState(actor);
  const cost = Math.max(0, Number(amount) || 0);
  if (state.points < cost) {
    ui.notifications.warn(`Nova Era: ${actor.name} não possui ${cost} PS.`);
    return false;
  }
  if (sacrifice) {
    const hp = Number(actor.system.attributes?.hp?.value ?? 0);
    const loss = cost * proficiency(actor);
    if (hp - loss < 1) {
      ui.notifications.warn(`Nova Era: Sacrifício exige ${loss} PV e não pode reduzir ${actor.name} abaixo de 1 PV.`);
      return false;
    }
    await actor.update({ "system.attributes.hp.value": hp - loss }, { novaEraSacrifice: true });
  }
  await setBloodPoints(actor, state.points - cost, { reason });
  const key = roundKey();
  if (berserkerLevel(actor) >= 20 && state.frenzy && actor.getFlag(MODULE_ID, "berserkerInexhaustibleRound") !== key) {
    await actor.setFlag(MODULE_ID, "berserkerInexhaustibleRound", key);
    await gainBlood(actor, 1, "Sangue Inesgotável");
  }
  return true;
}

function meleeItem(item) {
  const activation = item?.system?.activities?.contents?.[0]?.activation?.type ?? item?.system?.activation?.type ?? "";
  const actionType = item?.system?.actionType ?? item?.system?.activities?.contents?.[0]?.attack?.type?.value ?? "";
  return ["mwak", "msak"].includes(actionType) || ["mwak", "msak"].includes(activation) || item?.system?.range?.units === "touch";
}

function selectedTarget() {
  const targets = [...game.user.targets];
  return targets.length === 1 ? targets[0].actor : null;
}

async function onAttack(rolls, data = {}) {
  const item = data.subject?.item ?? data.subject;
  const actor = data.subject?.actor ?? item?.actor;
  if (!isNovaEraBerserker(actor) || !meleeItem(item) || !isAutomationAuthority(actor)) return;
  const target = selectedTarget();
  const roll = rolls?.[0];
  const hit = target && roll && Number(roll.total) >= Number(target.system.attributes?.ac?.value ?? Infinity);
  if (!hit) return;
  const key = turnKey();
  if (actor.getFlag(MODULE_ID, "berserkerCausedTurn") !== key) {
    await actor.setFlag(MODULE_ID, "berserkerCausedTurn", key);
    const critical = !!roll.isCritical || Number(roll.dice?.[0]?.total ?? 0) >= Number(roll.dice?.[0]?.faces ?? 20);
    await gainBlood(actor, critical ? 2 : 1, critical ? "Violência Causada — crítico" : "Violência Causada");
  }
  const state = bloodState(actor);
  if (state.frenzy && actor.getFlag(MODULE_ID, "berserkerGrowingTurn") !== key) {
    await actor.setFlag(MODULE_ID, "berserkerGrowingTurn", key);
    const bonus = await new Roll(String(proficiency(actor))).evaluate();
    await bonus.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Violência Crescente — dano adicional do Frenesi" });
  }
  Hooks.callAll("novaEraBerserkerMeleeHit", { actor, target, item, roll });
}

async function onPreUpdateActor(actor, changed, options) {
  if (!isNovaEraBerserker(actor) || options?.novaEraSacrifice) return;
  const next = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  if (next === undefined) return;
  options.novaEraPreviousHp = Number(actor.system.attributes.hp.value ?? 0);
}

async function onUpdateActor(actor, changed, options = {}) {
  if (!isNovaEraBerserker(actor) || !isAutomationAuthority(actor) || options.novaEraSacrifice) return;
  const next = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  if (next === undefined || Number(next) >= Number(options.novaEraPreviousHp ?? next)) return;
  const key = turnKey();
  if (actor.getFlag(MODULE_ID, "berserkerSufferedTurn") === key) return;
  await actor.setFlag(MODULE_ID, "berserkerSufferedTurn", key);
  await gainBlood(actor, 1, "Violência Sofrida");
}

async function onCombatStart(combat) {
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!isNovaEraBerserker(actor) || !isAutomationAuthority(actor)) continue;
    const floor = berserkerLevel(actor) >= 19 ? Math.max(0, bloodThreshold(actor) - 1) : 0;
    await setBloodPoints(actor, floor, { reason: "Iniciativa" });
  }
}

export async function useBrutalStrike(actor) {
  const state = bloodState(actor);
  const used = actor.getFlag(MODULE_ID, "berserkerBrutalRound") === roundKey();
  if (used) return ui.notifications.warn("Nova Era: Golpe Brutal já foi usado nesta rodada.");
  if (!state.points) return ui.notifications.warn("Nova Era: não há Pontos de Sangue disponíveis.");
  const maximum = Math.min(state.points, proficiency(actor));
  const result = await Dialog.prompt({
    title: "Golpe Brutal",
    content: `<form><div class="form-group"><label>PS a gastar (1–${maximum})</label><input name="points" type="number" min="1" max="${maximum}" value="1"></div></form>`,
    label: "Desferir",
    callback: html => Number(html.find("[name='points']").val() ?? 1),
    rejectClose: false
  });
  if (!result) return false;
  const points = Math.clamp(result, 1, maximum);
  if (!await spendBlood(actor, points, { reason: "Golpe Brutal" })) return false;
  await actor.setFlag(MODULE_ID, "berserkerBrutalRound", roundKey());
  const level = berserkerLevel(actor);
  const die = level >= 17 ? 12 : level >= 11 ? 10 : level >= 5 ? 8 : 6;
  const roll = await new Roll(`${points}d${die}`, actor.getRollData()).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Golpe Brutal — ${points} PS` });
  return true;
}

export async function useBloodTechnique(actor, item) {
  if (!isNovaEraBerserker(actor) || item?.parent !== actor || !String(item.getFlag(MODULE_ID, "group") ?? "").startsWith("tecnicas-")) {
    ui.notifications.warn("Nova Era: escolha uma Técnica de Sangue conhecida pelo personagem.");
    return false;
  }
  const required = Number(item.getFlag(MODULE_ID, "level") ?? 0);
  if (berserkerLevel(actor) < required) {
    ui.notifications.warn(`Nova Era: ${item.name} exige nível ${required}.`);
    return false;
  }
  const cost = Number(item.getFlag(MODULE_ID, "bloodCost") ?? 0);
  const sacrifice = !!item.getFlag(MODULE_ID, "sacrifice");
  if (!await spendBlood(actor, cost, { reason: item.name, sacrifice })) return false;
  const hpCost = sacrifice ? cost * proficiency(actor) : 0;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<section class="nova-era berserker-chat"><h2>${item.name}</h2><p><strong>${cost} PS${hpCost ? ` + ${hpCost} PV de Sacrifício` : ""}</strong></p>${item.system.description?.value ?? ""}</section>`
  });
  Hooks.callAll("novaEraBerserkerTechniqueUsed", { actor, item, cost, sacrifice });
  return true;
}

export function registerBerserkerAutomation() {
  Hooks.on("dnd5e.postRollAttack", (rolls, data) => void onAttack(rolls, data));
  Hooks.on("preUpdateActor", (actor, changed, options) => void onPreUpdateActor(actor, changed, options));
  Hooks.on("updateActor", (actor, changed, options) => void onUpdateActor(actor, changed, options));
  Hooks.on("combatStart", combat => void onCombatStart(combat));
  Hooks.on("createItem", item => { if (isNovaEraBerserker(item.parent)) void setBloodPoints(item.parent, bloodState(item.parent).points, { reason: "Sincronização" }); });
  Hooks.on("deleteItem", item => { if (item.parent && isNovaEraBerserker(item.parent)) void setBloodPoints(item.parent, bloodState(item.parent).points, { reason: "Sincronização" }); });
}
