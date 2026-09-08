import { MODULE_ID } from "../constants.mjs";
import { berserkerLevel, bloodState, gainBlood, isNovaEraBerserker, setBloodPoints, spendBlood } from "./core-automation.mjs";

const ICON = `modules/${MODULE_ID}/assets/icons/berserker/coracao-frenesi-v1.png`;
const EFFECT_FLAG = "berserkerLegacyEffect";
const SOCKET_TYPE = "berserkerLegacy";

function key(item) { return item?.getFlag?.(MODULE_ID, "contentKey") ?? ""; }
function has(actor, contentKey) { return actor?.items?.some(item => key(item) === contentKey); }
function prof(actor) { return Number(actor.system?.attributes?.prof ?? 2); }
function con(actor) { return Number(actor.system?.abilities?.con?.mod ?? 0); }
function roundKey() { return game.combat?.started ? `${game.combat.id}:${game.combat.round}` : `free:${Math.floor(Date.now() / 6000)}`; }
function turnKey() { return game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : `free:${Math.floor(Date.now() / 6000)}`; }
function responsible(actor) {
  const owners = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER")).sort((a, b) => a.id.localeCompare(b.id));
  return owners[0]?.id === game.user.id || (!owners.length && game.user.isGM && game.users.activeGM?.id === game.user.id);
}
function belowHalf(actor) {
  const hp = actor.system?.attributes?.hp ?? {};
  return Number(hp.value ?? 0) <= Number(hp.max ?? 0) / 2;
}
function attacker(actor) {
  const record = actor.getFlag(MODULE_ID, "berserkerLastAttacker");
  if (!record?.actorUuid || Date.now() - Number(record.at ?? 0) > 30_000) return null;
  return game.actors.get(String(record.actorUuid).split(".").at(-1));
}
function selectedTarget() { const selected = [...game.user.targets]; return selected.length === 1 ? selected[0].actor : null; }
function melee(activity) {
  const item = activity?.item;
  const type = activity?.attack?.type?.value ?? activity?.attack?.type ?? item?.system?.actionType;
  const valid = activity?.validAttackTypes instanceof Set ? [...activity.validAttackTypes] : [];
  return ["melee", "mwak", "msak"].includes(type) || valid.some(value => ["melee", "mwak", "msak"].includes(value)) || ["simpleM", "martialM", "natural"].includes(item?.system?.type?.value);
}
async function confirm(title, text) {
  return Dialog.confirm({ title, content: `<section class="nova-era ne-trigger-dialog"><div><strong>${title}</strong><p>${text}</p></div></section>`, yes: () => true, no: () => false, defaultYes: false });
}
async function post(actor, title, text) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era berserker-chat"><h2>${title}</h2><p>${text}</p></section>` });
}
async function executeDocument(uuid, type, data = {}) {
  const document = await fromUuid(uuid);
  if (!document) return false;
  if (type === "create-effect") {
    const previous = document.effects.find(effect => effect.getFlag(MODULE_ID, EFFECT_FLAG) === data.effect.flags?.[MODULE_ID]?.[EFFECT_FLAG]);
    if (previous) await previous.delete({ novaEraLegacy: true });
    await document.createEmbeddedDocuments("ActiveEffect", [data.effect], { novaEraLegacy: true });
  }
  if (type === "delete-effect") await document.delete({ novaEraLegacy: true });
  if (type === "update-actor") await document.update(data.change, { novaEraLegacyDamage: true, ...(data.options ?? {}) });
  return true;
}
async function action(document, type, data = {}) {
  if (!document) return false;
  if (game.user.isGM || document.isOwner) return executeDocument(document.uuid, type, data);
  game.socket.emit(`module.${MODULE_ID}`, { type: SOCKET_TYPE, uuid: document.uuid, action: type, data });
  return true;
}
async function setEffect(actor, effectKey, active, { name = effectKey, changes = [], flags = {}, duration = {} } = {}) {
  const current = actor.effects.find(effect => effect.getFlag(MODULE_ID, EFFECT_FLAG) === effectKey);
  if (!active && current) return current.delete({ novaEraLegacy: true });
  if (!active) return current;
  if (current) {
    const desiredFlags = { [MODULE_ID]: { [EFFECT_FLAG]: effectKey, ...flags } };
    if (current.name !== name || JSON.stringify(current.changes) !== JSON.stringify(changes) || JSON.stringify(current.flags?.[MODULE_ID] ?? {}) !== JSON.stringify(desiredFlags[MODULE_ID])) {
      await current.update({ name, changes, flags: desiredFlags }, { novaEraLegacy: true });
    }
    return current;
  }
  return actor.createEmbeddedDocuments("ActiveEffect", [{ name, img: ICON, origin: actor.uuid, disabled: false, changes, duration: { startTime: game.time.worldTime, ...duration }, flags: { [MODULE_ID]: { [EFFECT_FLAG]: effectKey, ...flags } } }], { novaEraLegacy: true });
}

async function syncLegacyEffects(actor) {
  if (!isNovaEraBerserker(actor) || !responsible(actor)) return;
  const state = bloodState(actor);
  await setEffect(actor, "imortal-necrotic", has(actor, "imortal-essencia"), {
    name: "Essência Imortal — resistência necrótica",
    changes: [{ key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "necrotic", priority: 20 }]
  });
  await setEffect(actor, "frenesi-aprimorado", state.frenzy && has(actor, "berserker-frenesi-aprimorado"), {
    name: "Frenesi Aprimorado",
    changes: [
      { key: "flags.dnd5e.advantage.ability.check.str", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "1", priority: 20 },
      { key: "flags.dnd5e.advantage.ability.save.str", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "1", priority: 20 }
    ], flags: { ignoreNonmagicalDifficultTerrain: true, proneStandCost: 1.5 }
  });
  const evolved = berserkerLevel(actor) >= 14;
  await setEffect(actor, "mutation-legs", state.frenzy && has(actor, "berserker-mutacao-pernas"), {
    name: `Pernas do Predador${evolved ? " — Evoluída" : ""}`,
    changes: [{ key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "3", priority: 20 }],
    flags: { climbEqualsWalk: true, evolved }
  });
  await setEffect(actor, "mutation-carapace", state.frenzy && has(actor, "berserker-mutacao-carapaca"), {
    name: `Carapaça Óssea${evolved ? " — Evoluída" : ""}`,
    changes: [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1", priority: 20 }],
    flags: { physicalReduction: evolved ? 2 : 0, evolved }
  });
  await setEffect(actor, "mutation-senses", has(actor, "berserker-mutacao-sentidos"), {
    name: `Sentidos Selvagens${evolved ? " — Evoluída" : ""}`,
    changes: [{ key: "system.attributes.senses.darkvision", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "18", priority: 20 }],
    flags: { hearingSmellAdvantage: true, detectInvisibleRange: evolved ? 3 : 0, cannotBeSurprised: evolved }
  });
  await setEffect(actor, "mutation-gills", has(actor, "berserker-mutacao-branquias"), {
    name: `Brânquias Abissais${evolved ? " — Evoluída" : ""}`,
    flags: { breatheAirAndWater: true, swimEqualsWalk: true, evolved }
  });
  const form = has(actor, "besta-forma") && state.frenzy && state.points >= (berserkerLevel(actor) >= 18 ? state.threshold : state.maximum);
  await setEffect(actor, "predatory-form", form, { name: "Forma Predatória", flags: { naturalWeaponDie: berserkerLevel(actor) >= 18 ? "1d12" : "1d10", evolvedMutations: evolved } });
}

async function onDamaged({ actor, damage }) {
  if (!responsible(actor) || damage <= 0) return;
  if (has(actor, "imortal-essencia") && belowHalf(actor) && actor.getFlag(MODULE_ID, "imortalExtraBloodRound") !== roundKey()) {
    await actor.setFlag(MODULE_ID, "imortalExtraBloodRound", roundKey());
    await gainBlood(actor, 1, "Essência Imortal — Limiar da Morte");
  }
  const state = bloodState(actor);
  if (has(actor, "imortal-ascensao") && belowHalf(actor) && !actor.getFlag(MODULE_ID, "imortalAscensionUsed")) {
    if (await confirm("Ascensão Imortal", "A carne alcançou o Limiar da Morte. Ativar a Ascensão Imortal por 1 minuto?")) {
      const hp = actor.system.attributes.hp;
      const restored = Math.max(1, Math.ceil(Number(hp.max ?? 1) / 4));
      await actor.update({ "system.attributes.hp.value": Math.min(Number(hp.max), Math.max(Number(hp.value), 0) + restored) }, { novaEraSacrifice: true });
      await actor.setFlag(MODULE_ID, "imortalAscensionUsed", true);
      const resistance = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "slashing", "thunder"].map(value => ({ key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value, priority: 30 }));
      await setEffect(actor, "immortal-ascension", true, { name: "Ascensão Imortal", changes: resistance, flags: { regeneration: "1d12", preserveAtOneOnce: true }, duration: { seconds: 60 } });
      await post(actor, "Ascensão Imortal", "Por um minuto, o corpo se recusa a reconhecer a própria ruína.");
    }
  }
  if (Number(actor.system.attributes.hp.value ?? 0) <= 0 && has(actor, "imortal-vontade") && state.points >= 2 && !actor.getFlag(MODULE_ID, "imortalWillUsed")) {
    if (await confirm("Vontade Inquebrável", "Gastar 2 PS para permanecer com 1 PV?")) {
      if (await spendBlood(actor, 2, { reason: "Vontade Inquebrável" })) {
        await actor.update({ "system.attributes.hp.value": 1 }, { novaEraSacrifice: true });
        await actor.setFlag(MODULE_ID, "imortalWillUsed", true);
        await post(actor, "Vontade Inquebrável", "A morte encontrou o Berserker — e foi recusada.");
      }
    }
  }
  if (bloodState(actor).frenzy && has(actor, "berserker-frenesi-superior") && actor.getFlag(MODULE_ID, "berserkerReactionRound") !== roundKey()) {
    const source = attacker(actor);
    if (source && await confirm("Retaliação Brutal", `${source.name} feriu você. Usar sua Reação para realizar um ataque corpo a corpo sem Golpe Brutal ou Técnica?`)) {
      await actor.setFlag(MODULE_ID, "berserkerReactionRound", roundKey());
      await setEffect(actor, "retaliation-attack", true, { name: "Retaliação Brutal — ataque sem Técnicas", flags: { suppressBloodTechniques: true, consumeOnMeleeAttack: true } });
      const weapon = actor.items.find(item => item.type === "weapon" && ["simpleM", "martialM", "natural"].includes(item.system?.type?.value));
      if (weapon?.use) await weapon.use({}, { configureDialog: true });
      else await post(actor, "Retaliação Brutal", `Realize agora um ataque corpo a corpo contra ${source.name}.`);
    }
  }
  const source = attacker(actor);
  if (source && has(actor, "berserker-mutacao-espinhos") && actor.getFlag(MODULE_ID, `spines-${source.id}`) !== turnKey()) {
    await actor.setFlag(MODULE_ID, `spines-${source.id}`, turnKey());
    const hp = Number(source.system.attributes.hp.value ?? 0);
    await action(source, "update-actor", { change: { "system.attributes.hp.value": Math.max(0, hp - prof(actor)) } });
    if (berserkerLevel(actor) >= 14) await action(source, "create-effect", { effect: { name: "Espinhos Reativos — deslocamento reduzido", img: ICON, origin: actor.uuid, disabled: false, duration: { rounds: 1 }, changes: [{ key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-3", priority: 25 }], flags: { [MODULE_ID]: { [EFFECT_FLAG]: `spines-slow-${actor.id}` } } } });
  }
}

async function onMeleeHit({ actor, target, item }) {
  if (!responsible(actor) || !target) return;
  if (has(actor, "carniceiro-carnificina") && (has(actor, "carniceiro-avatar") || actor.getFlag(MODULE_ID, "carnificinaTurn") !== turnKey())) {
    await actor.setFlag(MODULE_ID, "carnificinaTurn", turnKey());
    await action(target, "create-effect", { effect: { name: `Sangrando — ${actor.name}`, img: ICON, origin: actor.uuid, disabled: false, duration: { rounds: 10 }, flags: { [MODULE_ID]: { [EFFECT_FLAG]: `bleeding-${actor.id}`, bleedingSourceUuid: actor.uuid } } } });
    await post(actor, "Carnificina", `${target.name} está Sangrando. A ferida cobrará seu preço no início do turno.`);
  }
  const bleeding = target.effects.some(effect => effect.getFlag(MODULE_ID, "bleedingSourceUuid") === actor.uuid);
  if (bleeding && has(actor, "carniceiro-profundo") && bloodState(actor).points < bloodState(actor).threshold && actor.getFlag(MODULE_ID, "deepBleedingRound") !== roundKey()) {
    await actor.setFlag(MODULE_ID, "deepBleedingRound", roundKey());
    await gainBlood(actor, 1, "Sangramento Profundo");
  }
  const momentum = actor.effects.find(effect => effect.getFlag(MODULE_ID, EFFECT_FLAG) === "carnage-momentum");
  if (momentum) {
    const hp = Number(target.system.attributes.hp.value ?? 0);
    await action(target, "update-actor", { change: { "system.attributes.hp.value": Math.max(0, hp - 2) } });
    await momentum.delete({ novaEraLegacy: true });
    await post(actor, "Embalo da Carnificina", `${target.name} sofre +2 de dano pelo ímpeto acumulado.`);
  }
  if (bloodState(actor).frenzy && has(actor, "frenetico-embalo")) {
    await setEffect(actor, "carnage-momentum", true, { name: "Embalo da Carnificina", flags: { moveWithoutOpportunity: 3, nextTargetBonus: 2, expiresAtTurnStart: actor.uuid } });
  }
  if (has(actor, "berserker-mutacao-glandulas") && item?.system?.type?.value === "natural" && actor.getFlag(MODULE_ID, "toxicGlandsTurn") !== turnKey()) {
    await actor.setFlag(MODULE_ID, "toxicGlandsTurn", turnKey());
    const result = await target.rollSavingThrow({ ability: "con" });
    const roll = Array.isArray(result) ? result[0] : result?.[0] ?? result;
    if (Number(roll?.total ?? 0) < 8 + prof(actor) + con(actor)) {
      const evolved = berserkerLevel(actor) >= 14;
      await action(target, "create-effect", { effect: { name: `Glândulas Tóxicas — ${actor.name}`, img: ICON, origin: actor.uuid, disabled: false, statuses: evolved ? ["poisoned"] : [], duration: { rounds: 1 }, flags: { [MODULE_ID]: { [EFFECT_FLAG]: `toxic-${actor.id}`, noHealing: true } } } });
      await post(actor, "Glândulas Tóxicas", `${target.name} não pode recuperar PV até o próximo turno${evolved ? " e fica Envenenado" : ""}.`);
    }
  }
}

async function turnStart(combat, changed) {
  if (!("turn" in changed || "round" in changed)) return;
  const actor = combat.combatant?.actor;
  if (!actor) return;
  for (const bleeding of actor.effects.filter(effect => effect.getFlag(MODULE_ID, "bleedingSourceUuid"))) {
    const source = await fromUuid(bleeding.getFlag(MODULE_ID, "bleedingSourceUuid"));
    if (!source || !responsible(source)) continue;
    const hp = Number(actor.system.attributes.hp.value ?? 0);
    await action(actor, "update-actor", { change: { "system.attributes.hp.value": Math.max(0, hp - prof(source)) } });
    const save = await actor.rollSavingThrow({ ability: "con" });
    const roll = Array.isArray(save) ? save[0] : save?.[0] ?? save;
    const dc = 8 + prof(source) + con(source);
    if (Number(roll?.total ?? 0) >= dc) await action(bleeding, "delete-effect");
  }
  if (!isNovaEraBerserker(actor) || !responsible(actor)) return;
  const ascension = actor.effects.find(effect => effect.getFlag(MODULE_ID, EFFECT_FLAG) === "immortal-ascension");
  if (ascension) {
    const roll = await new Roll("1d12 + @con", { con: con(actor) }).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Ascensão Imortal — Regeneração" });
    const hp = actor.system.attributes.hp;
    await actor.update({ "system.attributes.hp.value": Math.min(Number(hp.max), Number(hp.value) + Number(roll.total)) }, { novaEraSacrifice: true });
  }
  if (has(actor, "imortal-regeneracao") && belowHalf(actor) && bloodState(actor).points >= (has(actor, "imortal-imortalidade") ? 0 : 1)) {
    const free = has(actor, "imortal-imortalidade") && actor.getFlag(MODULE_ID, "imortalFreeRegenRound") !== roundKey();
    if (await confirm("Regeneração Sangrenta", `Recuperar ${bloodState(actor).frenzy ? "1d12" : "1d8"} + CON PV${free ? " sem custo" : " por 1 PS"}?`)) {
      if (free) await actor.setFlag(MODULE_ID, "imortalFreeRegenRound", roundKey());
      if (free || await spendBlood(actor, 1, { reason: "Regeneração Sangrenta" })) {
        const roll = await new Roll(`${bloodState(actor).frenzy ? "1d12" : "1d8"} + @con`, { con: con(actor) }).evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Regeneração Sangrenta" });
        const hp = actor.system.attributes.hp;
        await actor.update({ "system.attributes.hp.value": Math.min(Number(hp.max), Number(hp.value) + Number(roll.total)) }, { novaEraSacrifice: true });
      }
    }
  }
  await syncLegacyEffects(actor);
}

async function onBloodChanged({ actor, before, after }) {
  await syncLegacyEffects(actor);
  if (before.frenzy && !after.frenzy && has(actor, "frenetico-ruptura")) {
    await actor.setFlag(MODULE_ID, "freneticoLostFrenzy", { at: Date.now(), round: roundKey() });
    const choice = await Dialog.prompt({
      title: "Ruptura Frenética",
      content: `<form><div class="form-group"><label>Escolha o efeito da Ruptura</label><select name="choice"><option value="move">Mover metade sem ataques de oportunidade</option><option value="suppress">Suprimir ataques de oportunidade do alvo</option><option value="temp">Receber PV temporários</option></select></div></form>`,
      label: "Romper", callback: html => String(html.find("[name='choice']").val()), rejectClose: false
    });
    if (choice === "temp") {
      const hp = actor.system.attributes.hp;
      await actor.update({ "system.attributes.hp.temp": Math.max(Number(hp.temp ?? 0), prof(actor) + Math.max(1, before.points - after.points)) }, { novaEraSacrifice: true });
    } else await setEffect(actor, "rupture-movement", true, { name: "Ruptura Frenética", flags: { moveHalfWithoutOpportunity: choice === "move", suppressTargetOpportunity: choice === "suppress", expiresAtTurnStart: actor.uuid } });
  }
  if (!before.frenzy && after.frenzy && has(actor, "frenetico-impeto")) {
    await setEffect(actor, "frenetic-impetus", true, {
      name: "Ímpeto Frenético",
      changes: [{ key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "3", priority: 30 }],
      flags: { ignoreDifficultTerrain: true, advantageAfterMoving: 3, expiresAtTurnStart: actor.uuid }
    });
    await post(actor, "Ímpeto Frenético", "O coração rompe o compasso; agora só existe o próximo impacto.");
  }
  if (!before.frenzy && after.frenzy && has(actor, "frenetico-devastador") && actor.getFlag(MODULE_ID, "freneticoLostFrenzy")) {
    await setEffect(actor, "devastating-discount", true, { name: "Frenesi Devastador — próxima Técnica custa −1 PS", flags: { expiresAtTurnStart: actor.uuid } });
  }
}

async function resetRest(actor, result, config = {}) {
  if (!isNovaEraBerserker(actor) || !(config.type === "long" || config.type === "short" || result?.type)) return;
  await actor.unsetFlag(MODULE_ID, "imortalWillUsed");
  if (config.type === "long" || result?.type === "long") await actor.unsetFlag(MODULE_ID, "imortalAscensionUsed");
}

async function overrideMidiSave(workflow) {
  const failed = workflow?.failedSaves instanceof Set ? [...workflow.failedSaves] : [];
  for (const token of failed) {
    const actor = token.actor;
    if (!isNovaEraBerserker(actor) || !responsible(actor) || !bloodState(actor).frenzy || !has(actor, "berserker-frenesi-irrestrito")) continue;
    if (bloodState(actor).points < 2 || actor.getFlag(MODULE_ID, "unrestrainedFrenzyRound") === roundKey()) continue;
    if (!await confirm("Frenesi Irrestrito", "Se esta falha causaria Amedrontado, Atordoado, Enfeitiçado ou Paralisado, gastar 2 PS para transformá-la em sucesso?")) continue;
    if (!await spendBlood(actor, 2, { reason: "Frenesi Irrestrito" })) continue;
    await actor.setFlag(MODULE_ID, "unrestrainedFrenzyRound", roundKey());
    workflow.failedSaves.delete(token);
    workflow.saves?.add?.(token);
    await post(actor, "Frenesi Irrestrito", "A condição tentou dominar a fúria — e a fúria venceu.");
  }
}

function halveBleedingHealing(actor, changed, options = {}) {
  if (options.novaEraLegacyDamage || options.novaEraSacrifice) return;
  const current = Number(actor.system?.attributes?.hp?.value ?? 0);
  const next = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  if (next === undefined || Number(next) <= current) return;
  const deep = actor.effects.some(effect => {
    const sourceUuid = effect.getFlag(MODULE_ID, "bleedingSourceUuid");
    const source = sourceUuid ? game.actors.get(String(sourceUuid).split(".").at(-1)) : null;
    return source && has(source, "carniceiro-profundo");
  });
  if (deep) foundry.utils.setProperty(changed, "system.attributes.hp.value", current + Math.floor((Number(next) - current) / 2));
}

async function predatoryAttack(config) {
  const activity = config?.subject ?? config?.activity;
  const actor = activity?.actor ?? config?.actor;
  const target = selectedTarget();
  if (!actor || !target || !melee(activity) || !has(actor, "carniceiro-predador")) return;
  if (!target.effects.some(effect => effect.getFlag(MODULE_ID, "bleedingSourceUuid") === actor.uuid)) return;
  config.criticalThreshold = Math.min(Number(config.criticalThreshold ?? 20), 19);
  if (actor.getFlag(MODULE_ID, "predatoryAttackTurn") !== turnKey()) {
    config.advantage = true;
    await actor.setFlag(MODULE_ID, "predatoryAttackTurn", turnKey());
  }
}

async function onActorDefeated(actor, changed, options = {}) {
  if (options.novaEraLegacyReward) return;
  const next = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  if (next === undefined || Number(next) > 0) return;
  for (const bleeding of actor.effects.filter(effect => effect.getFlag(MODULE_ID, "bleedingSourceUuid"))) {
    const source = await fromUuid(bleeding.getFlag(MODULE_ID, "bleedingSourceUuid"));
    if (!source || !responsible(source)) continue;
    const execution = source.getFlag(MODULE_ID, "executionTarget");
    if (execution?.actorUuid === actor.uuid && execution.round === roundKey() && has(source, "carniceiro-execucao")) {
      await gainBlood(source, 2, "Execução Brutal");
      await source.unsetFlag(MODULE_ID, "executionTarget");
    }
    if (!has(source, "carniceiro-ceifador") || source.getFlag(MODULE_ID, "reaperRewardTurn") === turnKey()) continue;
    const choice = await Dialog.prompt({ title: "Ceifador Carmesim", content: `<form><p>${actor.name} morreu Sangrando a curta distância.</p><select name="choice"><option value="blood">Receber 1 PS</option><option value="heal">Curar CON + Proficiência</option></select></form>`, label: "Colher", callback: html => String(html.find("[name='choice']").val()), rejectClose: false });
    if (!choice) continue;
    await source.setFlag(MODULE_ID, "reaperRewardTurn", turnKey());
    if (choice === "blood") await gainBlood(source, 1, "Ceifador Carmesim");
    else {
      const hp = source.system.attributes.hp;
      await source.update({ "system.attributes.hp.value": Math.min(Number(hp.max), Number(hp.value) + Math.max(0, con(source) + prof(source))) }, { novaEraLegacyReward: true });
    }
  }
}

async function socket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || payload?.type !== SOCKET_TYPE) return;
  await executeDocument(payload.uuid, payload.action, payload.data);
}

export function registerBerserkerLegacyAutomation() {
  Hooks.on("novaEraBerserkerChanged", data => void onBloodChanged(data));
  Hooks.on("novaEraBerserkerDamaged", data => void onDamaged(data));
  Hooks.on("novaEraBerserkerMeleeHit", data => void onMeleeHit(data));
  Hooks.on("updateCombat", (combat, changed) => void turnStart(combat, changed));
  Hooks.on("dnd5e.restCompleted", (actor, result, config) => void resetRest(actor, result, config));
  Hooks.on("midi-qol.postCheckSaves", workflow => overrideMidiSave(workflow));
  Hooks.on("dnd5e.preRollAttack", config => predatoryAttack(config));
  Hooks.on("preUpdateActor", halveBleedingHealing);
  Hooks.on("updateActor", (actor, changed, options) => void onActorDefeated(actor, changed, options));
  Hooks.on("createItem", item => { if (isNovaEraBerserker(item.parent)) setTimeout(() => void syncLegacyEffects(item.parent), 100); });
  Hooks.on("deleteItem", item => { if (isNovaEraBerserker(item.parent)) setTimeout(() => void syncLegacyEffects(item.parent), 100); });
  Hooks.on("deleteActiveEffect", effect => {
    if (effect.getFlag(MODULE_ID, EFFECT_FLAG) === "immortal-ascension" && isNovaEraBerserker(effect.parent)) setTimeout(() => void setBloodPoints(effect.parent, bloodState(effect.parent).points, { reason: "Fim da Ascensão Imortal" }), 100);
  });
  for (const actor of game.actors.filter(isNovaEraBerserker)) setTimeout(() => void syncLegacyEffects(actor), 250);
  game.socket.on(`module.${MODULE_ID}`, payload => void socket(payload));
}
