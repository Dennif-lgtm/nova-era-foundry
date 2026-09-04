import { MODULE_ID } from "../constants.mjs";
import {
  activeEffectChange,
  createChronomancerEffect,
  deleteChronomancerEffect,
  mayManageChronomancer,
  removeEffectKey
} from "./effect-engine.mjs";
import { confirmedChronomancerMovement } from "./confluence-automation.mjs";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

function chronomancerState(actor) {
  const maximum = Math.max(1, Number(actor.system?.attributes?.prof ?? 0) + Number(actor.system?.abilities?.int?.mod ?? 0));
  const stored = actor.getFlag(MODULE_ID, "chronomancerState") ?? {};
  return {
    ...stored,
    maximum,
    points: Math.max(0, Math.min(maximum, Number(stored.points ?? maximum))),
    reaction: stored.reaction !== false,
    limitedUses: stored.limitedUses && typeof stored.limitedUses === "object" ? stored.limitedUses : {}
  };
}

async function updateChronomancerState(actor, changes) {
  const current = chronomancerState(actor);
  const next = { ...current, ...changes };
  next.points = Math.max(0, Math.min(current.maximum, Number(next.points)));
  await actor.setFlag(MODULE_ID, "chronomancerState", next);
  Hooks.callAll("novaEraChronomancerChanged", actor);
}

function contentKey(document) {
  return document?.getFlag?.(MODULE_ID, "contentKey") ?? document?.flags?.[MODULE_ID]?.contentKey ?? "";
}

function has(actor, key) {
  return actor?.items?.some(item => contentKey(item) === key);
}

function activeToken(actor) {
  return actor?.getActiveTokens?.()[0] ?? null;
}

function targetToken(actor) {
  return [...(game.user.targets ?? [])][0] ?? activeToken(actor);
}

function roundKey() {
  return `${game.combat?.id ?? "scene"}:${game.combat?.round ?? 0}`;
}

function featureState(actor) {
  return actor.getFlag(MODULE_ID, "chronomancerFeatureState") ?? {};
}

async function saveFeatureState(actor, state) {
  await actor.setFlag(MODULE_ID, "chronomancerFeatureState", state);
}

function selectedTarget(actor, context = {}) {
  if (context.targetActorUuid) return fromUuid(context.targetActorUuid);
  return Promise.resolve([...(game.user.targets ?? [])][0]?.actor ?? actor);
}

function distance(left, right) {
  const a = left?.center ?? left?.object?.center;
  const b = right?.center ?? right?.object?.center;
  if (!a || !b) return null;
  try { return canvas.grid.measurePath([a, b]).distance; } catch { return null; }
}

async function post(actor, title, text) {
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<section class="nova-era chronomancer-chat"><h2><i class="fa-solid fa-gears"></i> ${title}</h2><p>${text}</p></section>` });
}

async function choose(title, text, choices) {
  return new Promise(resolve => {
    new Dialog({
      title,
      content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-clock"></i><div><strong>${text}</strong></div></section>`,
      buttons: Object.fromEntries(choices.map(([key, label, icon = "fa-star"]) => [key, { icon: `<i class="fa-solid ${icon}"></i>`, label, callback: () => resolve(key) }])),
      close: () => resolve("")
    }, { classes: ["nova-era-feature-dialog"] }).render(true);
  });
}

async function ensureInitiativeAdvantage(actor) {
  const key = "affinity-initiative-advantage";
  const existing = actor.effects.find(effect => effect.getFlag(MODULE_ID, "effectKey") === key);
  if (has(actor, "crono-afinidade-2")) {
    if (!existing) await createChronomancerEffect(actor, {
      effectKey: key,
      name: "Afinidade II — Vantagem em Iniciativa",
      changes: [activeEffectChange("system.attributes.init.roll.mode", 1)]
    });
  } else if (existing) await deleteChronomancerEffect(existing);
}

async function synchronizePassives(actor) {
  if (!actor || !mayManageChronomancer(actor)) return;
  await ensureInitiativeAdvantage(actor);
}

async function spendFeature(actor, cost, usageKey = "") {
  const current = chronomancerState(actor);
  if (current.points < cost || !current.reaction) return false;
  const limitedUses = { ...current.limitedUses };
  if (usageKey) limitedUses[usageKey] = "round";
  await updateChronomancerState(actor, { points: current.points - cost, reaction: false, limitedUses });
  return true;
}

async function waitForReflexMovement(actor) {
  const token = activeToken(actor);
  if (!token) return;
  const origin = { x: token.document.x, y: token.document.y };
  await new Promise(resolve => {
    new Dialog({
      title: "Reflexos Temporais — Movimento",
      content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-person-running"></i><div><strong>Mova ${actor.name} até 3m agora.</strong><p>Depois do movimento, clique em Continuar. Se preferir permanecer no lugar, apenas continue.</p></div></section>`,
      buttons: { continue: { icon: '<i class="fa-solid fa-check"></i>', label: "Continuar ataque", callback: resolve } },
      default: "continue",
      close: resolve
    }, { classes: ["nova-era-reflex-move"] }).render(true);
  });
  const moved = distance({ center: { x: origin.x + token.w / 2, y: origin.y + token.h / 2 } }, token);
  if (moved !== null && moved > 3) {
    await token.document.update(origin, { novaEraChronomancer: true });
    ui.notifications.warn("Nova Era: movimento acima de 3m; o token retornou à posição inicial.");
  }
}

async function useTemporalReflexes(actor, workflow) {
  const feature = actor.items.find(item => contentKey(item) === "crono-reflexos-temporais");
  if (!feature || !mayManageChronomancer(actor)) return false;
  const current = chronomancerState(actor);
  const roundKey = `${game.combat?.id ?? "scene"}:${game.combat?.round ?? 0}`;
  if (!current.reaction || current.points < 2 || current.limitedUses[feature.id] === roundKey) return false;
  const use = await Dialog.confirm({
    title: "Reflexos Temporais disponíveis",
    content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-shield-halved"></i><div><strong>${workflow.item?.name ?? "Um ataque"} foi declarado contra você.</strong><p>Gastar 2 PT e sua Reação para mover até 3m e receber +2 CA e vantagem nas resistências deste ataque?</p></div></section>`,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });
  if (!use || !await spendFeature(actor, 2)) return false;
  const state = chronomancerState(actor);
  await updateChronomancerState(actor, { limitedUses: { ...state.limitedUses, [feature.id]: roundKey } });
  await waitForReflexMovement(actor);
  await createChronomancerEffect(actor, {
    effectKey: `temporal-reflexes-${workflow.id}`,
    name: "Reflexos Temporais — +2 CA e vantagem",
    changes: [
      activeEffectChange("system.attributes.ac.bonus", 2),
      ...ABILITIES.map(ability => activeEffectChange(`system.abilities.${ability}.save.roll.mode`, 1))
    ],
    flags: { workflowId: workflow.id }
  });
  await post(actor, "Reflexos Temporais", "+2 CA e vantagem nas resistências foram aplicados mecanicamente até o encerramento deste ataque.");
  return true;
}

async function midiPreAttack(workflow) {
  const targets = [...(workflow.targets ?? [])];
  for (const target of targets) {
    const actor = target.actor ?? target.document?.actor;
    if (actor) await useTemporalReflexes(actor, workflow);
  }
}

async function corePreAttack(activity) {
  if (game.modules.get("midi-qol")?.active || activity?.type !== "attack") return;
  const workflow = { id: `core-${activity.uuid}-${Date.now()}`, item: activity.item, targets: game.user.targets };
  for (const target of workflow.targets ?? []) if (target.actor) await useTemporalReflexes(target.actor, workflow);
}

async function corePostActivity(activity) {
  if (game.modules.get("midi-qol")?.active) return;
  const prefix = `temporal-reflexes-core-${activity.uuid}`;
  for (const actor of game.actors.filter(candidate => mayManageChronomancer(candidate))) {
    for (const effect of actor.effects.filter(candidate => String(candidate.getFlag(MODULE_ID, "effectKey") ?? "").startsWith(prefix))) await deleteChronomancerEffect(effect);
  }
}

async function grantInitiativePartner(actor, combatants) {
  if (!has(actor, "crono-afinidade-2") || !mayManageChronomancer(actor)) return;
  const origin = activeToken(actor);
  const allies = game.combat?.combatants.filter(combatant => {
    if (!combatant.actor || combatant.actor === actor) return false;
    const token = combatant.token?.object;
    if (!token || distance(origin, token) === null) return false;
    return Number(token.document.disposition) === Number(origin?.document.disposition);
  }) ?? [];
  if (!allies.length) return;
  const selected = await choose("Afinidade II — Visão das Possibilidades", "Qual aliado visível recebe seu modificador de Inteligência na Iniciativa?", allies.map(combatant => [combatant.id, combatant.name, "fa-hourglass-start"]));
  const combatant = game.combat?.combatants.get(selected);
  if (!combatant) return;
  const bonus = Number(actor.system?.abilities?.int?.mod ?? 0);
  if (combatant.initiative != null) await combatant.update({ initiative: Number(combatant.initiative) + bonus }, { novaEraChronomancer: true });
  else await createChronomancerEffect(combatant.actor, {
    effectKey: `affinity-initiative-${game.combat.id}`,
    name: `Afinidade II — +${bonus} Iniciativa`,
    changes: [activeEffectChange("system.attributes.init.bonus", bonus)],
    flags: { consumeOn: "initiative" }
  });
  await post(actor, "Afinidade II", `${combatant.name} recebeu <strong>+${bonus} na Iniciativa</strong>.`);
}

async function removeInitiativeBonus(actor) {
  if (!actor || !mayManageChronomancer(actor)) return;
  await removeEffectKey(actor, `affinity-initiative-${game.combat?.id}`);
}

async function rejectSurprise(effect) {
  const actor = effect.parent;
  if (!actor || !has(actor, "crono-afinidade-3") || Number(actor.system?.attributes?.hp?.value ?? 0) <= 0 || !mayManageChronomancer(actor)) return;
  const surprised = effect.statuses?.has?.("surprised") || /surpreendid|surprised/i.test(effect.name ?? "");
  if (!surprised) return;
  setTimeout(() => void deleteChronomancerEffect(effect), 0);
  ui.notifications.info(`Nova Era: ${actor.name} não pode ficar Surpreendido enquanto estiver consciente.`);
}

export async function selectGeneratedTrail(actor, entry, law) {
  if (!law || !/Reação/i.test(entry.execution) || !has(actor, "crono-fluxo-continuo")) return law;
  const selected = await choose("Fluxo Contínuo", `Qual Rastro ${entry.item.name} deve gerar?`, ["Precedência", "Atraso", "Repetição", "Continuidade", "Ruptura"].map(value => [value, value, "fa-wave-square"]));
  return selected || law;
}

export async function applyTreatiseInterventionBenefit(actor, entry, context = {}) {
  const laws = entry.laws ?? [];
  const target = context.targetActorUuid ? await fromUuid(context.targetActorUuid) : [...(game.user.targets ?? [])][0]?.actor ?? actor;
  if (has(actor, "crono-linha-estavel") && laws.some(law => ["Continuidade", "Precedência"].includes(law))) {
    const selected = await choose("Linha Estável", "Escolha o benefício desta Intervenção", [["range", "+3m de alcance", "fa-ruler"], ["ac", "+1 CA ao afetado", "fa-shield"]]);
    if (selected === "range") context.rangeBonus = Number(context.rangeBonus ?? 0) + 3;
    else if (selected === "ac" && target) await createChronomancerEffect(target, {
      effectKey: `stable-line-ac-${actor.id}`,
      name: "Linha Estável — +1 CA",
      changes: [activeEffectChange("system.attributes.ac.bonus", 1)],
      flags: { expiresAtTurnStart: target.uuid }
    });
  }
  if (has(actor, "crono-mestre-precedencia") && laws.some(law => ["Precedência", "Atraso"].includes(law))) {
    const selected = await choose("Mestre da Precedência", "Escolha o benefício desta Intervenção", [["range", "+3m de alcance", "fa-ruler"], ["move", "Movimento de 1,5m", "fa-person-running"]]);
    if (selected === "range") context.rangeBonus = Number(context.rangeBonus ?? 0) + 3;
    else if (selected === "move") await confirmedChronomancerMovement(targetToken(target), 1.5, "Mestre da Precedência");
  }
  if (has(actor, "crono-eco-possibilidade") && laws.some(law => ["Repetição", "Ruptura"].includes(law))) {
    const selected = await choose("Eco de Possibilidade", "Escolha o benefício desta Intervenção", [["range", "+3m de alcance", "fa-ruler"], ["trail", "Prolongar o Rastro", "fa-clock-rotate-left"]]);
    if (selected === "range") context.rangeBonus = Number(context.rangeBonus ?? 0) + 3;
    else if (selected === "trail") context.extendTrail = true;
  }
  return context;
}

async function recoverConfluencePoint(actor, usageKey) {
  const state = featureState(actor);
  if (state[usageKey] === roundKey()) {
    ui.notifications.warn("Nova Era: esta recuperação de PT já foi usada nesta rodada.");
    return false;
  }
  const current = chronomancerState(actor);
  if (current.points >= current.maximum) return false;
  state[usageKey] = roundKey();
  await saveFeatureState(actor, state);
  await updateChronomancerState(actor, { points: current.points + 1 });
  return true;
}

async function grantNextRollBonus(actor, target) {
  await createChronomancerEffect(target, {
    effectKey: `fracture-reading-bonus-${actor.id}`,
    name: "Leitura das Fraturas — +2",
    changes: [
      activeEffectChange("system.bonuses.mwak.attack", 2),
      activeEffectChange("system.bonuses.rwak.attack", 2),
      activeEffectChange("system.bonuses.msak.attack", 2),
      activeEffectChange("system.bonuses.rsak.attack", 2),
      activeEffectChange("system.bonuses.abilities.save", 2)
    ],
    flags: { consumeOn: "attack-or-save", expiresAtTurnStart: target.uuid }
  });
}

async function fractureReading(actor, context) {
  if (!has(actor, "crono-leitura-fraturas")) return;
  const selected = await choose("Leitura das Fraturas", "A Confluência abriu uma possibilidade. Escolha seu benefício.", [
    ["point", "Recuperar 1 PT", "fa-gem"],
    ["move", "Mover até 3m", "fa-person-running"],
    ["bonus", "+2 no próximo ataque ou resistência", "fa-dice-d20"]
  ]);
  if (selected === "point") {
    if (await recoverConfluencePoint(actor, "fractureReadingRound")) await post(actor, "Leitura das Fraturas", "1 Ponto Temporal foi recuperado.");
  } else if (selected === "move") await confirmedChronomancerMovement(activeToken(actor), 3, "Leitura das Fraturas");
  else if (selected === "bonus") {
    const target = await selectedTarget(actor, context);
    await grantNextRollBonus(actor, target);
    await post(actor, "Leitura das Fraturas", `${target.name} recebeu +2 mecânico no próximo ataque ou resistência.`);
  }
}

async function treatiseConfluence(actor, laws, context) {
  if (has(actor, "crono-sequencia-preferencial") && laws.some(law => ["Precedência", "Atraso"].includes(law))) {
    const selected = await choose("Sequência Preferencial", "Escolha o benefício do Tratado", [["point", "Recuperar 1 PT", "fa-gem"], ["move", "Aliado move 3m", "fa-person-running"]]);
    if (selected === "point") await recoverConfluencePoint(actor, "sequencePointRound");
    else if (selected === "move") await confirmedChronomancerMovement(targetToken(await selectedTarget(actor, context)), 3, "Sequência Preferencial");
  }
  if (has(actor, "crono-probabilidades-paralelas") && laws.some(law => ["Repetição", "Ruptura"].includes(law))) {
    const selected = await choose("Probabilidades Paralelas", "Escolha o benefício do Tratado", [["point", "Recuperar 1 PT", "fa-gem"], ["reroll", "Preparar repetição de teste", "fa-dice"]]);
    if (selected === "point") await recoverConfluencePoint(actor, "probabilityPointRound");
    else if (selected === "reroll") await createChronomancerEffect(actor, {
      effectKey: "parallel-probability-reroll",
      name: "Probabilidades Paralelas — Repetição preparada",
      flags: { probabilityReroll: true, expiresAtTurnStart: actor.uuid }
    });
  }
  if (has(actor, "crono-continuidade-compartilhada") && laws.some(law => ["Continuidade", "Precedência"].includes(law))) {
    const selected = await choose("Continuidade Compartilhada", "Escolha o benefício do Tratado", [["point", "Recuperar 1 PT", "fa-gem"], ["shield", "Reduzir o próximo dano", "fa-shield-heart"]]);
    if (selected === "point") await recoverConfluencePoint(actor, "continuityPointRound");
    else if (selected === "shield") {
      const target = await selectedTarget(actor, context);
      const roll = await new Roll("1d8 + @modifier", { modifier: Number(actor.system?.abilities?.int?.mod ?? 0) }).evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Continuidade Compartilhada" });
      await createChronomancerEffect(target, {
        effectKey: `shared-continuity-${actor.id}`,
        name: `Continuidade Compartilhada — redução ${roll.total}`,
        flags: { damageReduction: Number(roll.total), expiresAtTurnStart: actor.uuid }
      });
    }
  }
}

export async function resolveChronomancerConfluenceFeatures(actor, entry, name, previousLaw, newLaw, context = {}) {
  const laws = [previousLaw, newLaw];
  await fractureReading(actor, context);
  await treatiseConfluence(actor, laws, context);
  if (has(actor, "crono-dominio-relacoes") && entry.category === "Disciplina") {
    const preserve = await Dialog.confirm({
      title: "Domínio das Relações",
      content: `<section class="nova-era ne-trigger-dialog"><i class="fa-solid fa-link"></i><div><strong>Conservar o Rastro de ${previousLaw}?</strong><p>Este benefício pode ser usado uma vez até o início do seu próximo turno.</p></div></section>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
    const state = featureState(actor);
    const currentTurn = `${game.combat?.id ?? "scene"}:${game.combat?.round ?? 0}:${game.combat?.turn ?? 0}`;
    if (preserve && state.domainTurn !== currentTurn) {
      state.domainTurn = currentTurn;
      await saveFeatureState(actor, state);
      await updateChronomancerState(actor, { trail: previousLaw, trailExpiry: "end-next-turn" });
    }
  }
  await post(actor, name, "Os efeitos mecânicos disponíveis da Confluência e das características associadas foram resolvidos.");
}

function reduceNextDamage(actor, amount, updates) {
  if (amount <= 0 || !mayManageChronomancer(actor)) return;
  const effect = actor.effects.find(candidate => Number(candidate.getFlag(MODULE_ID, "damageReduction") ?? 0) > 0);
  if (!effect) return;
  const reduction = Math.min(amount, Number(effect.getFlag(MODULE_ID, "damageReduction")));
  const hpPath = "system.attributes.hp.value";
  if (Number.isFinite(Number(updates[hpPath]))) updates[hpPath] = Math.min(Number(actor.system.attributes.hp.max), Number(updates[hpPath]) + reduction);
  setTimeout(() => void deleteChronomancerEffect(effect), 0);
  ui.notifications.info(`Nova Era: ${actor.name} reduziu ${reduction} de dano com Continuidade Compartilhada.`);
}

async function offerProbabilityReroll(rolls, data = {}) {
  const actor = data.subject?.actor ?? data.subject ?? data.actor;
  const roll = rolls?.[0] ?? rolls;
  if (!actor || !roll || !mayManageChronomancer(actor)) return;
  const effect = actor.effects.find(candidate => candidate.getFlag(MODULE_ID, "probabilityReroll"));
  if (!effect) return;
  const use = await Dialog.confirm({ title: "Probabilidades Paralelas", content: `<p>Repetir a jogada de resultado <strong>${roll.total}</strong> e usar obrigatoriamente o novo resultado?</p>`, yes: () => true, no: () => false, defaultYes: false });
  if (!use) return;
  const reroll = await roll.reroll({ async: true });
  await reroll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Probabilidades Paralelas — novo resultado obrigatório" });
  await deleteChronomancerEffect(effect);
}

export function registerChronomancerFeatureAutomation() {
  for (const actor of game.actors) void synchronizePassives(actor);
  Hooks.on("createItem", item => void synchronizePassives(item.parent));
  Hooks.on("deleteItem", item => void synchronizePassives(item.parent));
  Hooks.on("updateItem", item => void synchronizePassives(item.parent));
  Hooks.on("createActiveEffect", effect => void rejectSurprise(effect));
  Hooks.on("midi-qol.preAttackRoll", midiPreAttack);
  Hooks.on("dnd5e.preUseActivity", activity => void corePreAttack(activity));
  Hooks.on("dnd5e.postUseActivity", activity => void corePostActivity(activity));
  Hooks.on("dnd5e.rollInitiative", (actor, combatants) => void grantInitiativePartner(actor, combatants));
  Hooks.on("dnd5e.rollInitiative", actor => void removeInitiativeBonus(actor));
  Hooks.on("dnd5e.preApplyDamage", reduceNextDamage);
  Hooks.on("dnd5e.postRollAbilityCheck", offerProbabilityReroll);
  Hooks.on("dnd5e.postRollSavingThrow", offerProbabilityReroll);
}
