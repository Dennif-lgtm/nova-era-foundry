import { MODULE_ID } from "../constants.mjs";
import { activeEffectChange, createChronomancerEffect, deleteChronomancerEffect, mayManageChronomancer } from "./effect-engine.mjs";
import { resolveChronomancerGreatTheory, swapWithChronomancerEcho } from "./great-theory-automation.mjs";
import { confirmedChronomancerMovement } from "./confluence-automation.mjs";

const STATE_FLAG = "chronomancerAdvancedState";
const ACTIVATABLE = new Set([
  "crono-primeiro-instante", "crono-tese-precedencia", "crono-clone-temporal-tratado",
  "crono-incontaveis-possibilidades", "crono-tempo-imutavel-tratado", "crono-tese-continuidade",
  "crono-existencia-paradoxal", "crono-quebra-tempo"
]);
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

function keyOf(item) { return item?.getFlag?.(MODULE_ID, "contentKey") ?? ""; }
function has(actor, key) { return actor?.items?.some(item => keyOf(item) === key); }
function state(actor) { return actor.getFlag(MODULE_ID, STATE_FLAG) ?? {}; }
async function save(actor, value) { await actor.setFlag(MODULE_ID, STATE_FLAG, value); Hooks.callAll("novaEraChronomancerChanged", actor); }
function turnKey() { return game.combat ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : `scene:${Math.floor(Date.now() / 6000)}`; }
function roundKey() { return game.combat ? `${game.combat.id}:${game.combat.round}` : "scene"; }
function active(data) { return Boolean(data && (data.expiresRound == null || Number(game.combat?.round ?? 0) < data.expiresRound) && (data.expiresAt == null || Date.now() < data.expiresAt)); }
function duration() { return game.combat ? { expiresRound: Number(game.combat.round ?? 0) + 10 } : { expiresAt: Date.now() + 60000 }; }

async function temporalState(actor, changes = {}) {
  const current = actor.getFlag(MODULE_ID, "chronomancerState") ?? {};
  const maximum = Math.max(1, Number(actor.system?.attributes?.prof ?? 0) + Number(actor.system?.abilities?.int?.mod ?? 0));
  const next = { ...current, ...changes };
  next.points = Math.max(0, Math.min(maximum, Number(next.points ?? maximum)));
  await actor.setFlag(MODULE_ID, "chronomancerState", next);
  Hooks.callAll("novaEraChronomancerChanged", actor);
  return next;
}

async function post(actor, title, text) {
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era chronomancer-chat"><h2><i class="fa-solid fa-hourglass-half"></i> ${title}</h2><blockquote>“O impossível é apenas um instante ainda não corrigido.”</blockquote><p>${text}</p></section>` });
}

async function spend(actor, points, useKey = "") {
  const temporal = actor.getFlag(MODULE_ID, "chronomancerState") ?? {};
  if (Number(temporal.points ?? 0) < points) { ui.notifications.warn(`Nova Era: são necessários ${points} PT.`); return false; }
  const limitedUses = { ...(temporal.limitedUses ?? {}) };
  if (useKey && limitedUses[useKey]) { ui.notifications.warn("Nova Era: esta característica já foi utilizada e exige Descanso Longo."); return false; }
  if (useKey) limitedUses[useKey] = "long";
  await temporalState(actor, { points: Number(temporal.points) - points, limitedUses });
  return true;
}

async function activateFirstInstant(actor, item) {
  if (!await spend(actor, 4)) return false;
  const current = state(actor);
  current.firstInstant = { ...duration(), secondReaction: true, firstPrecedenceTurn: "" };
  await save(actor, current);
  await createChronomancerEffect(actor, { effectKey: "first-instant", name: "Primeiro Instante — duas Reações", duration: { rounds: 10 }, flags: { expiresAtRound: current.firstInstant.expiresRound } });
  await post(actor, item.name, "Durante 1 minuto, há uma segunda Reação exclusiva para Intervenções e o primeiro uso de Precedência em cada turno custa 1 PT a menos.");
  return true;
}

async function activatePrecedenceThesis(actor, item) {
  const current = state(actor);
  if (current.precedenceThesisUsed) return ui.notifications.warn("Nova Era: Tese da Precedência já foi usada neste Descanso Longo.");
  current.precedenceThesisUsed = true;
  current.precedenceThesis = { combatId: game.combat?.id ?? "scene" };
  await save(actor, current);
  await post(actor, item.name, "Ativa até o fim do combate: primeira Intervenção da rodada sem custo e benefícios de abertura para aliados próximos.");
  return true;
}

async function activateBreakTime(actor, item) {
  if (!await spend(actor, 0, "breakTime")) return false;
  const temporal = actor.getFlag(MODULE_ID, "chronomancerState") ?? {};
  await temporalState(actor, { points: Number(temporal.points ?? 0) + 4 });
  const current = state(actor);
  current.breakTime = { ...duration() };
  await save(actor, current);
  await createChronomancerEffect(actor, { effectKey: "break-time", name: "Quebra do Tempo", duration: { rounds: 10 } });
  await post(actor, item.name, "Até 4 PT foram recuperados. Por 1 minuto, todas as categorias entram no Paralelismo, cada Intervenção custa 1 PT a menos e produz uma Confluência.");
  return true;
}

async function activateClone(actor, item) {
  if (!await spend(actor, 5)) return false;
  const current = state(actor);
  let cloneOption = "";
  if (has(actor, "crono-incontaveis-possibilidades") && !current.countlessPossibilitiesUsed) {
    cloneOption = await new Promise(resolve => new Dialog({ title: "Incontáveis Possibilidades", content: "<p>Escolha o aprimoramento deste Clone Temporal ou preserve o uso.</p>", buttons: {
      two: { label: "Criar dois Clones", callback: () => resolve("two") },
      concentration: { label: "Sem Concentração", callback: () => resolve("no-concentration") },
      swap: { label: "Troca por Reação", callback: () => resolve("swap") },
      none: { label: "Não usar", callback: () => resolve("") }
    }, close: () => resolve("") }).render(true));
    if (cloneOption) { current.countlessPossibilitiesUsed = true; current.cloneSwap = cloneOption === "swap" ? { round: "" } : null; await save(actor, current); }
  }
  return resolveChronomancerGreatTheory(actor, { item, category: "Grande Teoria", laws: ["Repetição", "Ruptura"], cost: 0 }, { treatiseClone: true, cloneOption });
}

async function activateImmutableTime(actor, item) {
  if (!await spend(actor, 5)) return false;
  const current = state(actor);
  current.immutableTime = { ...duration(), usedSaves: {} };
  await save(actor, current);
  await createChronomancerEffect(actor, { effectKey: "immutable-time-source", name: "Tempo Imutável — concentração", duration: { rounds: 10 }, flags: { immutableTimeSource: true } });
  await synchronizeImmutableZone(actor);
  await post(actor, item.name, "A zona de 6m está ativa. Aliados recebem proteção mecânica e a primeira queda a 0 PV durante a duração é convertida em 1 PV.");
  return true;
}

async function activateContinuityThesis(actor, item) {
  const current = state(actor);
  if (!active(current.immutableTime)) return ui.notifications.warn("Nova Era: ative Tempo Imutável primeiro.");
  if (current.continuityThesisUsed) return ui.notifications.warn("Nova Era: Tese da Continuidade já foi usada neste Descanso Longo.");
  const choice = await new Promise(resolve => new Dialog({ title: item.name, content: "<p>Escolha a tese aplicada durante Tempo Imutável.</p>", buttons: {
    critical: { label: "Impedir críticos", callback: () => resolve("critical") },
    free: { label: "Continuidade grátis", callback: () => resolve("free") },
    rescue: { label: "Resgate a 1 PV", callback: () => resolve("rescue") }
  }, close: () => resolve("") }).render(true));
  if (!choice) return false;
  current.continuityThesisUsed = true;
  current.continuityThesis = choice;
  await save(actor, current);
  await synchronizeImmutableZone(actor);
  return true;
}

export async function activateChronomancerFeature(actor, itemOrKey) {
  const item = typeof itemOrKey === "string" ? actor.items.find(value => keyOf(value) === itemOrKey) : itemOrKey;
  const key = keyOf(item);
  if (!actor?.isOwner || !ACTIVATABLE.has(key)) return false;
  if (key === "crono-primeiro-instante") return activateFirstInstant(actor, item);
  if (key === "crono-tese-precedencia") return activatePrecedenceThesis(actor, item);
  if (key === "crono-clone-temporal-tratado") return activateClone(actor, item);
  if (key === "crono-tempo-imutavel-tratado") return activateImmutableTime(actor, item);
  if (key === "crono-tese-continuidade") return activateContinuityThesis(actor, item);
  if (key === "crono-quebra-tempo") return activateBreakTime(actor, item);
  ui.notifications.info("Nova Era: esta característica reage automaticamente ao gatilho descrito.");
  return true;
}

export function chronomancerAdvancedRules(actor, entry) {
  const current = state(actor);
  const breaking = active(current.breakTime);
  const first = active(current.firstInstant);
  const precedenceDiscount = first && entry.laws?.includes("Precedência") && current.firstInstant.firstPrecedenceTurn !== turnKey();
  const thesisFree = current.precedenceThesis?.combatId === (game.combat?.id ?? "scene") && current.precedenceThesis.freeRound !== roundKey();
  const continuityFree = current.continuityThesis === "free" && entry.laws?.includes("Continuidade") && current.continuityFreeRound !== roundKey();
  return { breaking, precedenceDiscount, thesisFree, continuityFree, anyParallelCategory: breaking, extraReaction: first && current.firstInstant.secondReaction === true };
}

export async function recordChronomancerAdvancedUse(actor, entry, rules, usedExtraReaction = false) {
  const current = state(actor);
  if (rules.precedenceDiscount) current.firstInstant.firstPrecedenceTurn = turnKey();
  if (rules.thesisFree) current.precedenceThesis.freeRound = roundKey();
  if (rules.continuityFree) current.continuityFreeRound = roundKey();
  if (usedExtraReaction) current.firstInstant.secondReaction = false;
  await save(actor, current);
}

export function forcedConfluenceLaw(actor, law) {
  if (!chronomancerAdvancedRules(actor, { laws: [law] }).breaking) return "";
  return ({ "Precedência": "Atraso", "Atraso": "Repetição", "Repetição": "Ruptura", "Continuidade": "Precedência", "Ruptura": "Continuidade" })[law] ?? "Precedência";
}

function tokenDistance(a, b) {
  try { return canvas.grid.measurePath([a.center, b.center]).distance; } catch { return Infinity; }
}

async function synchronizeImmutableZone(source) {
  if (!active(state(source).immutableTime)) return;
  const origin = source.getActiveTokens?.()[0];
  if (!origin) return;
  for (const actor of game.actors) {
    const token = actor.getActiveTokens?.()[0];
    const ally = token && Number(token.document.disposition) === Number(origin.document.disposition) && tokenDistance(origin, token) <= 6;
    const existing = actor.effects.find(effect => effect.getFlag(MODULE_ID, "effectKey") === `immutable-time-${source.id}`);
    if (ally && !existing) await createChronomancerEffect(actor, {
      effectKey: `immutable-time-${source.id}`,
      name: "Tempo Imutável — proteção",
      changes: ABILITIES.map(ability => activeEffectChange(`system.abilities.${ability}.save.roll.mode`, 1)),
      flags: { immutableTimeProtector: source.uuid }
    });
    if (!ally && existing) await deleteChronomancerEffect(existing);
  }
}

function allied(left, right) {
  const a = left?.getActiveTokens?.()[0];
  const b = right?.getActiveTokens?.()[0];
  return Boolean(a && b && Number(a.document.disposition) === Number(b.document.disposition));
}

async function offerOpeningBenefits(source, activeActor) {
  if (!activeActor || activeActor === source || !allied(source, activeActor)) return;
  const origin = source.getActiveTokens?.()[0];
  const target = activeActor.getActiveTokens?.()[0];
  if (!origin || !target || tokenDistance(origin, target) > 9) return;
  const current = state(source);
  if (active(current.firstInstant)) {
    const use = await Dialog.confirm({ title: "Primeiro Instante", content: `<p>Permitir que <b>${activeActor.name}</b> mova metade do deslocamento sem Ataques de Oportunidade?</p>`, yes: () => true, no: () => false, defaultYes: false });
    if (use) await confirmedChronomancerMovement(target, Number(activeActor.system?.attributes?.movement?.walk ?? 0) / 2, "Primeiro Instante");
  }
  if (current.precedenceThesis?.combatId === game.combat?.id) {
    const option = await new Promise(resolve => new Dialog({ title: "Tese da Precedência", content: `<p>Escolha o benefício de abertura para <b>${activeActor.name}</b>.</p>`, buttons: {
      move: { label: "Mover 3m", callback: () => resolve("move") },
      bonus: { label: `+${Number(source.system?.abilities?.int?.mod ?? 0)} no primeiro ataque/resistência`, callback: () => resolve("bonus") },
      none: { label: "Não usar", callback: () => resolve("") }
    }, close: () => resolve("") }).render(true));
    if (option === "move") await confirmedChronomancerMovement(target, 3, "Tese da Precedência");
    if (option === "bonus") await createChronomancerEffect(activeActor, {
      effectKey: `precedence-thesis-bonus-${source.id}`,
      name: "Tese da Precedência — primeiro ataque ou resistência",
      changes: [
        ...["mwak", "rwak", "msak", "rsak"].map(type => activeEffectChange(`system.bonuses.${type}.attack`, Number(source.system?.abilities?.int?.mod ?? 0))),
        activeEffectChange("system.bonuses.abilities.save", Number(source.system?.abilities?.int?.mod ?? 0))
      ], flags: { consumeOn: "attack-or-save", expiresAtTurnStart: activeActor.uuid }
    });
  }
}

function failed(roll) {
  const success = roll?.options?.success ?? roll?.options?.isSuccess ?? roll?.isSuccess;
  if (success !== undefined) return success === false;
  const dc = Number(roll?.options?.targetValue ?? roll?.options?.dc);
  return Number.isFinite(dc) && Number(roll?.total) < dc;
}

async function offerParadoxicalExistence(rolls, data = {}) {
  const actor = data.subject?.actor ?? data.subject ?? data.actor;
  const roll = rolls?.find?.(failed) ?? (failed(rolls) ? rolls : null);
  if (!actor || !roll || !has(actor, "crono-existencia-paradoxal") || !mayManageChronomancer(actor)) return;
  const current = state(actor);
  if (current.paradoxicalExistenceUsed) return;
  const use = await Dialog.confirm({ title: "Existência Paradoxal", content: `<p>A jogada de <b>${actor.name}</b> falhou com ${roll.total}. Substituir por um sucesso válido e consumir o uso até o Descanso Longo?</p>`, yes: () => true, no: () => false, defaultYes: false });
  if (!use) return;
  current.paradoxicalExistenceUsed = true;
  await save(actor, current);
  await post(actor, "Existência Paradoxal", `O resultado ${roll.total} foi substituído por um sucesso possível. Este cartão é a resolução mecânica do resultado para o Mestre e para os gatilhos Nova Era.`);
  Hooks.callAll("novaEraChronomancerResultOverride", { actor, roll, result: "success" });
}

async function preventCriticalWithParadox(workflow) {
  if (!workflow?.isCritical) return;
  for (const target of workflow.targets ?? []) {
    const actor = target.actor;
    const immutable = actor?.effects?.find(effect => effect.getFlag(MODULE_ID, "immutableTimeProtector"));
    const protector = immutable ? game.actors.get(String(immutable.getFlag(MODULE_ID, "immutableTimeProtector")).split(".").at(-1)) : null;
    if (protector && state(protector).continuityThesis === "critical" && active(state(protector).immutableTime)) {
      workflow.isCritical = false;
      if (workflow.attackRoll?.options) workflow.attackRoll.options.criticalSuccess = 21;
      await post(protector, "Tese da Continuidade", `O Acerto Crítico contra ${actor.name} foi convertido em acerto normal.`);
      continue;
    }
    if (!actor || !has(actor, "crono-existencia-paradoxal") || !mayManageChronomancer(actor) || state(actor).paradoxicalExistenceUsed) continue;
    const use = await Dialog.confirm({ title: "Existência Paradoxal", content: `<p>Transformar o Acerto Crítico contra <b>${actor.name}</b> em um acerto normal?</p>`, yes: () => true, no: () => false, defaultYes: false });
    if (!use) continue;
    const current = state(actor); current.paradoxicalExistenceUsed = true; await save(actor, current);
    workflow.isCritical = false;
    if (workflow.attackRoll?.options) workflow.attackRoll.options.criticalSuccess = 21;
    await post(actor, "Existência Paradoxal", "O Acerto Crítico foi convertido mecanicamente em acerto normal antes do dano.");
  }
}

async function offerCloneSwap(activity) {
  if (activity?.type !== "attack") return;
  const targets = activity.targets ? [...activity.targets] : [...(game.user.targets ?? [])];
  for (const target of targets) {
    const actor = target.actor;
    const current = actor ? state(actor) : {};
    const temporal = actor?.getFlag?.(MODULE_ID, "chronomancerState") ?? {};
    if (!actor || !current.cloneSwap || current.cloneSwap.round === roundKey() || temporal.reaction === false || !mayManageChronomancer(actor)) continue;
    const echo = (canvas.scene?.tokens ?? []).find(token => token.getFlag(MODULE_ID, "chronomancerEcho") && token.getFlag(MODULE_ID, "sourceActorUuid") === actor.uuid);
    if (!echo) continue;
    const use = await Dialog.confirm({ title: "Incontáveis Possibilidades", content: `<p>Trocar <b>${actor.name}</b> de posição com o Clone Temporal antes deste ataque?</p>`, yes: () => true, no: () => false, defaultYes: false });
    if (!use || !await swapWithChronomancerEcho(actor, echo)) continue;
    current.cloneSwap.round = roundKey();
    temporal.reaction = false;
    await save(actor, current);
    await actor.setFlag(MODULE_ID, "chronomancerState", temporal);
    await post(actor, "Incontáveis Possibilidades", "A posição real foi trocada com o Clone Temporal antes da resolução do ataque.");
  }
}

function preventImmutableDeath(actor, changed, options) {
  if (options?.novaEraChronomancer) return;
  const nextHp = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  if (nextHp == null || Number(nextHp) > 0 || Number(actor.system?.attributes?.hp?.value ?? 0) <= 0) return;
  const protection = actor.effects.find(effect => effect.getFlag(MODULE_ID, "immutableTimeProtector"));
  const source = protection ? game.actors.get(String(protection.getFlag(MODULE_ID, "immutableTimeProtector")).split(".").at(-1)) : null;
  if (!source || !active(state(source).immutableTime)) return;
  const current = state(source);
  if (current.immutableTime.usedSaves?.[actor.uuid]) return;
  current.immutableTime.usedSaves ??= {};
  current.immutableTime.usedSaves[actor.uuid] = true;
  foundry.utils.setProperty(changed, "system.attributes.hp.value", 1);
  void save(source, current);
  ui.notifications.info(`Nova Era: Tempo Imutável manteve ${actor.name} com 1 PV.`);
}

function addActivationButton(app, html) {
  const item = app.item ?? app.document;
  if (!ACTIVATABLE.has(keyOf(item)) || !item?.actor?.isOwner) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector("[data-action='nova-era-activate-feature']")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "nova-era-activate-feature";
  button.innerHTML = '<i class="fa-solid fa-hourglass-start"></i> Ativar automação Nova Era';
  button.addEventListener("click", () => void activateChronomancerFeature(item.actor, item));
  root.querySelector("form")?.append(button);
}

function addActorSheetActivations(app, html) {
  const actor = app.actor ?? app.document;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!actor?.isOwner || !root || root.dataset.novaEraChronomancerActivation === "true") return;
  root.dataset.novaEraChronomancerActivation = "true";

  for (const row of root.querySelectorAll("[data-item-id]")) {
    const item = actor.items.get(row.dataset.itemId);
    if (!ACTIVATABLE.has(keyOf(item))) continue;
    const controls = row.querySelector(".item-controls");
    if (controls && !controls.querySelector("[data-action='nova-era-activate']")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "unbutton item-control nova-era-chronomancer-activate";
      button.dataset.action = "nova-era-activate";
      button.dataset.itemId = item.id;
      button.dataset.tooltip = "Ativar automação Nova Era";
      button.innerHTML = '<i class="fa-solid fa-hourglass-start"></i>';
      controls.prepend(button);
    }
  }

  root.addEventListener("click", event => {
    const activateButton = event.target.closest?.("[data-action='nova-era-activate']");
    const useImage = event.target.closest?.("[data-item-id] .item-image[data-action='use']");
    const row = (activateButton ?? useImage)?.closest?.("[data-item-id]");
    const item = row ? actor.items.get(row.dataset.itemId) : null;
    if (!ACTIVATABLE.has(keyOf(item))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void activateChronomancerFeature(actor, item);
  }, true);
}

async function resetTurn(combat, changed) {
  if (!("turn" in changed || "round" in changed)) return;
  const actor = combat.combatant?.actor;
  if (actor && mayManageChronomancer(actor)) {
    const current = state(actor);
    if (active(current.firstInstant)) current.firstInstant.secondReaction = true;
    await save(actor, current);
  }
  for (const source of game.actors.filter(candidate => mayManageChronomancer(candidate))) {
    const current = state(source);
    for (const key of ["firstInstant", "breakTime", "immutableTime"]) if (current[key] && !active(current[key])) delete current[key];
    await save(source, current);
    if (active(current.immutableTime)) await synchronizeImmutableZone(source);
    else for (const target of game.actors) {
      const effect = target.effects.find(value => value.getFlag(MODULE_ID, "effectKey") === `immutable-time-${source.id}`);
      if (effect) await deleteChronomancerEffect(effect);
    }
    await offerOpeningBenefits(source, actor);
  }
}

async function startCombat(combat) {
  for (const combatant of combat.combatants ?? []) {
    const actor = combatant.actor;
    if (!actor || !has(actor, "crono-tese-precedencia") || !mayManageChronomancer(actor) || state(actor).precedenceThesisUsed) continue;
    const use = await Dialog.confirm({ title: "Tese da Precedência", content: `<p>Ativar a Tese de <b>${actor.name}</b> até o fim deste combate?</p>`, yes: () => true, no: () => false, defaultYes: true });
    if (use) await activatePrecedenceThesis(actor, actor.items.find(item => keyOf(item) === "crono-tese-precedencia"));
  }
}

async function restCompleted(actor, result, config) {
  const longRest = result?.longRest === true || config?.type === "long";
  if (!longRest || !actor || !mayManageChronomancer(actor)) return;
  const current = state(actor);
  for (const key of ["precedenceThesisUsed", "continuityThesisUsed", "paradoxicalExistenceUsed", "countlessPossibilitiesUsed", "precedenceThesis", "continuityThesis", "firstInstant", "breakTime", "immutableTime", "cloneSwap"]) delete current[key];
  await save(actor, current);
}

export function registerChronomancerAdvancedFeatureAutomation() {
  for (const hook of ["renderItemSheet", "renderItemSheet5e", "renderItemSheetV2"]) Hooks.on(hook, addActivationButton);
  for (const hook of ["renderActorSheet", "renderActorSheetV2", "renderActorSheet5eCharacter", "renderActorSheet5eCharacter2"]) Hooks.on(hook, addActorSheetActivations);
  Hooks.on("preUpdateActor", preventImmutableDeath);
  Hooks.on("dnd5e.postRollAttack", offerParadoxicalExistence);
  Hooks.on("dnd5e.postRollAbilityCheck", offerParadoxicalExistence);
  Hooks.on("dnd5e.postRollSavingThrow", offerParadoxicalExistence);
  Hooks.on("dnd5e.preUseActivity", activity => void offerCloneSwap(activity));
  Hooks.on("midi-qol.preDamageRoll", preventCriticalWithParadox);
  Hooks.on("updateToken", () => { for (const actor of game.actors.filter(candidate => active(state(candidate).immutableTime) && mayManageChronomancer(candidate))) void synchronizeImmutableZone(actor); });
  Hooks.on("updateCombat", (combat, changed) => void resetTurn(combat, changed));
  Hooks.on("combatStart", combat => void startCombat(combat));
  Hooks.on("dnd5e.restCompleted", restCompleted);
}
